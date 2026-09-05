import os
import sys
import time
from datetime import datetime

import yt_dlp


def format_duration(seconds):
    seconds = int(round(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours:
        return f"{hours}h {minutes}m {seconds}s"
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def is_already_downloaded(video_id, output_dir):
    return os.path.exists(os.path.join(output_dir, f"{video_id}.mp3"))


def get_latest_videos(limit=None):
    if limit is None:
        limit = int(os.environ.get("PODCAST_LIMIT", "1"))

    opts = {
        "extract_flat": True,
        "playlistend": limit,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    url = "https://www.youtube.com/@zgrzytpodcast/videos"

    results = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        for entry in (info.get("entries") or [])[:limit]:
            video_id = entry["id"]
            results.append(
                {
                    "title": entry.get("title", "unknown"),
                    "video_id": video_id,
                    "url": entry.get("url")
                    or f"https://www.youtube.com/watch?v={video_id}",
                    "publish_date": entry.get("upload_date", "unknown"),
                }
            )

    return results


def progress_hook(d):
    status = d.get("status")

    if status == "downloading":
        percent = d.get("_percent_str", "N/A").strip()
        speed = d.get("_speed_str", "N/A").strip()
        eta = d.get("_eta_str", "N/A").strip()
        print(f"\r  {percent} | {speed} | ETA: {eta}  ", end="", flush=True)

    elif status == "finished":
        print("\n  Downloaded, converting to MP3...")


def download_audio(videos, output_dir=None):
    if output_dir is None:
        output_dir = os.environ.get("PODCAST_DIR", "/podcasts")

    os.makedirs(output_dir, exist_ok=True)
    total = len(videos)
    stats = {"downloaded": 0, "skipped": 0, "unavailable": 0, "failed": 0}

    for i, video in enumerate(videos, 1):
        title = video["title"]
        video_id = video["video_id"]

        if is_already_downloaded(video_id, output_dir):
            print(f"[{i}/{total}] Skipping (already downloaded): {title}")
            stats["skipped"] += 1
            continue

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{i}/{total}] [{now}] Downloading: {title}")
        print(f"  Publish date: {video['publish_date']}")

        conversion_state = {"started_at": None}

        def postprocessor_hook(d):
            postprocessor = d.get("postprocessor", "")
            status = d.get("status")

            if "ExtractAudio" not in postprocessor:
                return

            if (
                status in {"started", "processing"}
                and conversion_state["started_at"] is None
            ):
                conversion_state["started_at"] = time.monotonic()
            elif status == "finished" and conversion_state["started_at"] is not None:
                elapsed = time.monotonic() - conversion_state["started_at"]
                print(f"  MP3 conversion finished in: {format_duration(elapsed)}")

        opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_dir, "%(id)s.%(ext)s"),
            "progress_hooks": [progress_hook],
            "postprocessor_hooks": [postprocessor_hook],
            "continuedl": True,
            "retries": 10,
            "fragment_retries": 10,
            "extractor_retries": 5,
            "file_access_retries": 3,
            "socket_timeout": 30,
            "concurrent_fragment_downloads": 1,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
        }

        non_retryable_markers = (
            "Sign in to confirm your age",
            "confirm you're not a bot",
            "Private video",
            "members-only",
            "This video is not available",
        )
        max_attempts = int(os.environ.get("DOWNLOAD_RETRIES", "3"))
        video_started_at = time.monotonic()

        for attempt in range(1, max_attempts + 1):
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    result = ydl.download([video["url"]])

                if result == 0:
                    total_elapsed = time.monotonic() - video_started_at
                    print(f"  Total time: {format_duration(total_elapsed)}\n")
                    stats["downloaded"] += 1
                else:
                    stats["failed"] += 1
                break

            except yt_dlp.utils.DownloadError as e:
                details = str(e)
                if any(marker in details for marker in non_retryable_markers):
                    print(f"\n  Download error (not retryable): {title}")
                    print(f"  Details: {e}")
                    print("  Skipping to next file...\n")
                    stats["unavailable"] += 1
                    break

                if attempt < max_attempts:
                    wait = 10 * attempt
                    print(
                        f"\n  Download error (attempt {attempt}/{max_attempts}): {title}"
                    )
                    print(f"  Details: {e}")
                    print(f"  Retrying in {wait}s...\n")
                    time.sleep(wait)
                    continue

                print(f"\n  Download error after {max_attempts} attempts: {title}")
                print(f"  Details: {e}")
                print("  Skipping to next file...\n")
                stats["failed"] += 1
                break

            except Exception as e:
                print(f"\n  Unexpected error: {title}")
                print(f"  Details: {e}")
                print("  Skipping to next file...\n")
                stats["failed"] += 1
                break

    return stats


if __name__ == "__main__":
    videos = get_latest_videos()
    print(f"Found {len(videos)} videos.")
    stats = download_audio(videos)

    print(
        "Done! "
        f"downloaded={stats['downloaded']} "
        f"skipped={stats['skipped']} "
        f"unavailable={stats['unavailable']} "
        f"failed={stats['failed']}"
    )

    if stats["failed"]:
        print(
            f"ERROR: {stats['failed']} of {len(videos)} could not be downloaded after retries. "
            "Exiting with code 1 so the Job does not report a false success.",
            file=sys.stderr,
        )
        sys.exit(1)
