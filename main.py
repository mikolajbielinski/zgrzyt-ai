import os
import scrapetube
import yt_dlp


def get_latest_videos(limit=2):
    videos = scrapetube.get_channel(channel_username="zgrzytpodcast", limit=limit)
    return [f"https://www.youtube.com/watch?v={video['videoId']}" for video in videos]


def progress_hook(d):
    if d["status"] == "downloading":
        percent = d.get("_percent_str", "N/A").strip()
        speed = d.get("_speed_str", "N/A").strip()
        eta = d.get("_eta_str", "N/A").strip()
        print(f"\r  {percent} | {speed} | ETA: {eta}  ", end="", flush=True)
    elif d["status"] == "finished":
        print(f"\n  Pobrano, konwertowanie do MP3...")


def download_audio(urls, output_dir="videos"):
    os.makedirs(output_dir, exist_ok=True)
    opts = {
        "format": "bestaudio/best",
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download(urls)


if __name__ == "__main__":
    urls = get_latest_videos()
    print(f"Pobieranie {len(urls)} filmów jako MP3...")
    download_audio(urls)
    print("Gotowe!")
