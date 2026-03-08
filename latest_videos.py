import scrapetube


def get_latest_videos(limit=3):
    videos = scrapetube.get_channel(channel_username="zgrzytpodcast", limit=limit)
    return [f"https://www.youtube.com/watch?v={video['videoId']}" for video in videos]


if __name__ == "__main__":
    for link in get_latest_videos():
        print(link)
