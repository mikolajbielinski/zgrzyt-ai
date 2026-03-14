import os
import time
from datetime import datetime

import scrapetube
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

    videos = scrapetube.get_channel(
        channel_username="zgrzytpodcast",
        limit=limit,
    )

    results = []
    for video in videos:
        title = video["title"]["runs"][0]["text"]
        video_id = video["videoId"]
        publish_date = video.get("publishedTimeText", {}).get(
            "simpleText", "unknown"
        )

        results.append(
            {
                "title": title,
                "video_id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "publish_date": publish_date,
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

    for i, video in enumerate(videos, 1):
        title = video["title"]
        video_id = video["video_id"]

        if is_already_downloaded(video_id, output_dir):
            print(f"[{i}/{total}] Skipping (already downloaded): {title}")
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

            if status in {"started", "processing"} and conversion_state["started_at"] is None:
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

        video_started_at = time.monotonic()

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                result = ydl.download([video["url"]])

            if result == 0:
                total_elapsed = time.monotonic() - video_started_at
                print(f"  Total time: {format_duration(total_elapsed)}\n")

        except yt_dlp.utils.DownloadError as e:
            print(f"\n  Download error: {title}")
            print(f"  Details: {e}")
            print("  Skipping to next file...\n")
            continue
        except Exception as e:
            print(f"\n  Unexpected error: {title}")
            print(f"  Details: {e}")
            print("  Skipping to next file...\n")
            continue


if __name__ == "__main__":
    videos = get_latest_videos()
    print(f"Found {len(videos)} videos.")
    download_audio(videos)
    print("Done!")
