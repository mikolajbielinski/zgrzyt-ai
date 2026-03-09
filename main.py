import os
from datetime import datetime

import scrapetube
import yt_dlp


def get_latest_videos(limit=None):
    if limit is None:
        limit = int(os.environ.get("PODCAST_LIMIT", "1"))
    videos = scrapetube.get_channel(channel_username="zgrzytpodcast", limit=limit)
    results = []
    for video in videos:
        title = video["title"]["runs"][0]["text"]
        video_id = video["videoId"]
        publish_date = video.get("publishedTimeText", {}).get("simpleText", "brak daty")
        results.append({
            "title": title,
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "publish_date": publish_date,
        })
    return results


def progress_hook(d):
    if d["status"] == "downloading":
        percent = d.get("_percent_str", "N/A").strip()
        speed = d.get("_speed_str", "N/A").strip()
        eta = d.get("_eta_str", "N/A").strip()
        print(f"\r  {percent} | {speed} | ETA: {eta}  ", end="", flush=True)
    elif d["status"] == "finished":
        print(f"\n  Pobrano, konwertowanie do MP3...")


def is_already_downloaded(title, output_dir):
    safe_title = yt_dlp.utils.sanitize_filename(title)
    return os.path.exists(os.path.join(output_dir, f"{safe_title}.mp3"))


def download_audio(videos, output_dir=None):
    if output_dir is None:
        output_dir = os.environ.get("PODCAST_DIR", "/podcasts")
    os.makedirs(output_dir, exist_ok=True)

    total = len(videos)
    for i, video in enumerate(videos, 1):
        title = video["title"]

        if is_already_downloaded(title, output_dir):
            print(f"[{i}/{total}] Pomijam (już pobrane): {title}")
            continue

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{i}/{total}] [{now}] Pobieram: {title}")
        print(f"  Data publikacji: {video['publish_date']}")

        opts = {
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
            "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
            "progress_hooks": [progress_hook],
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video["url"]])


if __name__ == "__main__":
    videos = get_latest_videos()
    print(f"Znaleziono {len(videos)} filmów.")
    download_audio(videos)
    print("Gotowe!")
