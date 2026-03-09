import os
import re
import time
from datetime import datetime

import scrapetube
import yt_dlp

AUDIO_EXTENSIONS = {
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".opus",
    ".wav",
    ".flac",
    ".webm",
    ".mp4",
}

YOUTUBE_ID_RE = re.compile(r"\[([A-Za-z0-9_-]{11})\]\s*$")


def format_duration(seconds):
    seconds = int(round(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours:
        return f"{hours}h {minutes}m {seconds}s"
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def normalize_name(name):
    return " ".join(name.strip().split()).casefold()


def title_variants(title):
    variants = {normalize_name(title)}
    safe_title = yt_dlp.utils.sanitize_filename(title, restricted=False)
    variants.add(normalize_name(safe_title))
    return variants


def get_archive_path(output_dir):
    return os.path.join(output_dir, ".download_archive.txt")


def ensure_in_archive(video_id, output_dir):
    archive_path = get_archive_path(output_dir)
    line = f"youtube {video_id}\n"

    if os.path.exists(archive_path):
        with open(archive_path, "r", encoding="utf-8") as f:
            for existing_line in f:
                if existing_line == line:
                    return

    with open(archive_path, "a", encoding="utf-8") as f:
        f.write(line)


def build_existing_index(output_dir):
    existing_ids = set()
    existing_titles = set()

    for file_name in os.listdir(output_dir):
        full_path = os.path.join(output_dir, file_name)
        if not os.path.isfile(full_path):
            continue

        stem, ext = os.path.splitext(file_name)
        if ext.lower() not in AUDIO_EXTENSIONS:
            continue

        existing_titles.add(normalize_name(stem))

        match = YOUTUBE_ID_RE.search(stem)
        if match:
            existing_ids.add(match.group(1))

    return existing_ids, existing_titles


def add_video_to_index(video, existing_ids, existing_titles):
    existing_ids.add(video["video_id"])

    for variant in title_variants(video["title"]):
        existing_titles.add(variant)

    raw_with_id = f'{video["title"]} [{video["video_id"]}]'
    safe_title = yt_dlp.utils.sanitize_filename(video["title"], restricted=False)
    safe_with_id = f"{safe_title} [{video['video_id']}]"

    existing_titles.add(normalize_name(raw_with_id))
    existing_titles.add(normalize_name(safe_with_id))


def is_already_downloaded(video, existing_ids, existing_titles):
    if video["video_id"] in existing_ids:
        return True, "ID"

    for variant in title_variants(video["title"]):
        if variant in existing_titles:
            return True, "tytuł"

    return False, None


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
            "simpleText", "brak daty"
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
        print("\n  Pobrano, konwertowanie do MP3...")


def download_audio(videos, output_dir=None):
    if output_dir is None:
        output_dir = os.environ.get("PODCAST_DIR", "/podcasts")

    os.makedirs(output_dir, exist_ok=True)
    total = len(videos)

    existing_ids, existing_titles = build_existing_index(output_dir)

    for i, video in enumerate(videos, 1):
        title = video["title"]
        video_id = video["video_id"]

        already_downloaded, reason = is_already_downloaded(
            video, existing_ids, existing_titles
        )
        if already_downloaded:
            print(f"[{i}/{total}] Pomijam (już pobrane, znalezione po {reason}): {title}")
            ensure_in_archive(video_id, output_dir)
            add_video_to_index(video, existing_ids, existing_titles)
            continue

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{i}/{total}] [{now}] Pobieram: {title}")
        print(f"  Data publikacji: {video['publish_date']}")

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
                print(f"  Konwersja do MP3 zakończona w: {format_duration(elapsed)}")

        opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_dir, "%(title)s [%(id)s].%(ext)s"),
            "progress_hooks": [progress_hook],
            "postprocessor_hooks": [postprocessor_hook],
            "continuedl": True,
            "retries": 10,
            "fragment_retries": 10,
            "extractor_retries": 5,
            "file_access_retries": 3,
            "socket_timeout": 30,
            "concurrent_fragment_downloads": 1,
            "download_archive": get_archive_path(output_dir),
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
                print(f"  Całość zajęła: {format_duration(total_elapsed)}\n")
                add_video_to_index(video, existing_ids, existing_titles)

        except yt_dlp.utils.DownloadError as e:
            print(f"\n  Błąd pobierania: {title}")
            print(f"  Szczegóły: {e}")
            print("  Przechodzę do następnego pliku...\n")
            continue
        except Exception as e:
            print(f"\n  Nieoczekiwany błąd przy: {title}")
            print(f"  Szczegóły: {e}")
            print("  Przechodzę do następnego pliku...\n")
            continue


if __name__ == "__main__":
    videos = get_latest_videos()
    print(f"Znaleziono {len(videos)} filmów.")
    download_audio(videos)
    print("Gotowe!")