import os
from datetime import datetime, timedelta, timezone

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault("S3_BUCKET", "test-bucket")
os.environ.setdefault("NTFY_URL", "https://ntfy.example.com")
os.environ.setdefault("NTFY_TOPIC", "test")
os.environ.setdefault("NTFY_TOKEN", "tk_test")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

import main  # noqa: E402


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "notify", lambda t, m, p: calls.append((t, m, p)))
    return calls


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="eu-central-1")
        client.create_bucket(
            Bucket="test-bucket",
            CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
        )
        yield client


def put(s3, key):
    s3.put_object(Bucket="test-bucket", Key=key, Body=b"x")


def launch_instance(state="stopped"):
    ec2 = boto3.client("ec2", region_name="eu-central-1")
    instance = ec2.run_instances(
        ImageId="ami-12345678",
        MinCount=1,
        MaxCount=1,
        TagSpecifications=[
            {
                "ResourceType": "instance",
                "Tags": [{"Key": "Name", "Value": "zgrzyt-ai"}],
            }
        ],
    )["Instances"][0]
    if state == "stopped":
        ec2.stop_instances(InstanceIds=[instance["InstanceId"]])
    return ec2, instance["InstanceId"]


def test_empty_bucket_does_nothing(s3, sent):
    ec2, instance_id = launch_instance()
    main.start_transcription(s3, ec2)
    main.notify_ready_to_label(s3)
    main.alert_failures(s3)

    state = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]["State"]["Name"]
    assert state == "stopped"
    assert sent == []


def test_starts_instance_when_work_is_waiting(s3, sent):
    put(s3, "mp3/abc.mp3")
    ec2, instance_id = launch_instance("stopped")

    main.start_transcription(s3, ec2)

    state = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]["State"]["Name"]
    assert state in ("pending", "running")


def test_does_not_start_when_already_running(s3):
    put(s3, "mp3/abc.mp3")
    ec2, instance_id = launch_instance("running")
    main.start_transcription(s3, ec2)
    state = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]["State"]["Name"]
    assert state == "running"


def test_failed_episode_is_not_retried(s3):
    put(s3, "mp3/poison.mp3")
    put(s3, "failed/poison.json")
    ec2, instance_id = launch_instance("stopped")

    main.start_transcription(s3, ec2)

    state = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]["State"]["Name"]
    assert state == "stopped"


def test_labeled_episode_is_not_retranscribed(s3):
    put(s3, "mp3/old.mp3")
    put(s3, "transcripts/labeled/old.json")
    ec2, instance_id = launch_instance("stopped")

    main.start_transcription(s3, ec2)

    state = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"][0][
        "Instances"
    ][0]["State"]["Name"]
    assert state == "stopped"


def test_notifies_once_per_episode(s3, sent):
    put(s3, "transcripts/raw/abc.json")

    main.notify_ready_to_label(s3)
    main.notify_ready_to_label(s3)

    assert len(sent) == 1
    assert sent[0][0] == "Twoja kolej"
    assert "abc" in sent[0][1]


def test_marker_is_cleaned_after_labeling(s3, sent):
    put(s3, "transcripts/raw/abc.json")
    main.notify_ready_to_label(s3)
    assert "notified/abc" in [
        o["Key"] for o in s3.list_objects_v2(Bucket="test-bucket")["Contents"]
    ]

    put(s3, "transcripts/labeled/abc.json")
    main.notify_ready_to_label(s3)

    keys = [o["Key"] for o in s3.list_objects_v2(Bucket="test-bucket")["Contents"]]
    assert "notified/abc" not in keys


def test_alerts_once_per_failure(s3, sent):
    put(s3, "failed/broken.json")

    main.alert_failures(s3)
    main.alert_failures(s3)

    assert len(sent) == 1
    assert sent[0][2] == "high"


def test_alerts_when_instance_runs_too_long(monkeypatch, sent):
    launch_time = datetime.now(timezone.utc) - timedelta(
        hours=main.MAX_RUNTIME_HOURS + 1
    )
    monkeypatch.setattr(
        main,
        "find_instance",
        lambda _: {
            "InstanceId": "i-stuck",
            "State": {"Name": "running"},
            "LaunchTime": launch_time,
        },
    )

    main.alert_stuck_instance(object())

    assert len(sent) == 1
    assert sent[0][0] == "EC2 dziala za dlugo"
    assert sent[0][2] == "high"


def test_list_ids_reads_every_paginator_page():
    class FakePaginator:
        def paginate(self, **kwargs):
            assert kwargs == {
                "Bucket": "test-bucket",
                "Prefix": "transcripts/raw/",
            }
            return [
                {
                    "Contents": [
                        {"Key": "transcripts/raw/first.json"},
                        {"Key": "transcripts/raw/nested/ignored.json"},
                    ]
                },
                {"Contents": [{"Key": "transcripts/raw/second.json"}]},
            ]

    class FakeS3:
        def get_paginator(self, operation):
            assert operation == "list_objects_v2"
            return FakePaginator()

    assert main.list_ids(FakeS3(), "transcripts/raw/", ".json") == {
        "first",
        "second",
    }
