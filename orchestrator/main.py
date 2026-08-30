import os
import sys
from datetime import datetime, timedelta, timezone

import boto3
import requests

REQUIRED_ENV = ("S3_BUCKET", "NTFY_URL", "NTFY_TOPIC", "NTFY_TOKEN")

missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
if missing:
    print(
        f"Missing required environment variables: {', '.join(missing)}. "
        "Refusing to start - check the SOPS secret mounted into this CronJob.",
        file=sys.stderr,
    )
    sys.exit(1)

BUCKET = os.environ["S3_BUCKET"]
NTFY_URL = os.environ["NTFY_URL"]
NTFY_TOPIC = os.environ["NTFY_TOPIC"]
NTFY_TOKEN = os.environ["NTFY_TOKEN"]
INSTANCE_TAG = os.environ.get("EC2_INSTANCE_TAG", "zgrzyt-ai")
MAX_RUNTIME_HOURS = int(os.environ.get("EC2_MAX_RUNTIME_HOURS", "10"))

PREFIX_MP3 = "mp3/"
PREFIX_RAW = "transcripts/raw/"
PREFIX_LABELED = "transcripts/labeled/"
PREFIX_FAILED = "failed/"
PREFIX_NOTIFIED = "notified/"
PREFIX_ALERTED = "alerted/"


def log(message):
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def list_ids(s3, prefix, suffix):
    ids = set()
    for page in s3.get_paginator("list_objects_v2").paginate(
        Bucket=BUCKET, Prefix=prefix
    ):
        for obj in page.get("Contents", []):
            name = obj["Key"][len(prefix) :]
            if not name or "/" in name:
                continue
            if suffix and not name.endswith(suffix):
                continue
            ids.add(name[: -len(suffix)] if suffix else name)
    return ids


def touch(s3, key):
    s3.put_object(Bucket=BUCKET, Key=key, Body=b"")


def notify(title, message, priority):
    response = requests.post(
        f"{NTFY_URL.rstrip('/')}/{NTFY_TOPIC}",
        data=message.encode("utf-8"),
        headers={
            "Authorization": f"Bearer {NTFY_TOKEN}",
            "Title": title,
            "Priority": priority,
        },
        timeout=15,
    )
    response.raise_for_status()


def find_instance(ec2):
    reservations = ec2.describe_instances(
        Filters=[
            {"Name": "tag:Name", "Values": [INSTANCE_TAG]},
            {
                "Name": "instance-state-name",
                "Values": ["pending", "running", "stopping", "stopped"],
            },
        ]
    )["Reservations"]
    instances = [i for r in reservations for i in r["Instances"]]
    return instances[0] if instances else None


def start_transcription(s3, ec2):
    todo = (
        list_ids(s3, PREFIX_MP3, ".mp3")
        - list_ids(s3, PREFIX_RAW, ".json")
        - list_ids(s3, PREFIX_LABELED, ".json")
        - list_ids(s3, PREFIX_FAILED, ".json")
    )
    log(f"todo: {len(todo)} episode(s) waiting for transcription")
    if not todo:
        return

    instance = find_instance(ec2)
    if instance is None:
        log("ERROR: no instance tagged " + INSTANCE_TAG)
        notify("Orchestrator", f"No EC2 instance tagged {INSTANCE_TAG}", "high")
        return

    state = instance["State"]["Name"]
    if state in ("pending", "running"):
        log(f"instance {instance['InstanceId']} already {state}, nothing to do")
        return

    log(f"starting instance {instance['InstanceId']} (was {state})")
    ec2.start_instances(InstanceIds=[instance["InstanceId"]])


def notify_ready_to_label(s3):
    pending = list_ids(s3, PREFIX_RAW, ".json") - list_ids(s3, PREFIX_LABELED, ".json")
    already = list_ids(s3, PREFIX_NOTIFIED, "")

    for episode in sorted(pending - already):
        log(f"notifying: {episode} ready to label")
        notify("Twoja kolej", f"Odcinek {episode} czeka na opisanie mowcow", "default")
        touch(s3, f"{PREFIX_NOTIFIED}{episode}")

    for episode in sorted(already - pending):
        log(f"cleaning marker: {episode} is labeled")
        s3.delete_object(Bucket=BUCKET, Key=f"{PREFIX_NOTIFIED}{episode}")


def alert_failures(s3):
    failed = list_ids(s3, PREFIX_FAILED, ".json")
    already = list_ids(s3, PREFIX_ALERTED, "")

    for episode in sorted(failed - already):
        log(f"alerting: {episode} failed")
        notify("Transkrypcja nieudana", f"Odcinek {episode} trafil do failed/", "high")
        touch(s3, f"{PREFIX_ALERTED}{episode}")


def alert_stuck_instance(ec2):
    instance = find_instance(ec2)
    if instance is None or instance["State"]["Name"] != "running":
        return

    running_for = datetime.now(timezone.utc) - instance["LaunchTime"]
    if running_for > timedelta(hours=MAX_RUNTIME_HOURS):
        hours = int(running_for.total_seconds() // 3600)
        log(f"instance running for {hours}h, alerting")
        notify(
            "EC2 dziala za dlugo",
            f"Instancja chodzi od {hours}h - sprawdz, czy nie utknela",
            "high",
        )


def main():
    s3 = boto3.client("s3")
    ec2 = boto3.client("ec2")

    start_transcription(s3, ec2)
    notify_ready_to_label(s3)
    alert_failures(s3)
    alert_stuck_instance(ec2)

    log("done")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        log(f"ERROR: {type(err).__name__}: {err}")
        sys.exit(1)
