import main
import pytest


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (4.6, "5s"),
        (65, "1m 5s"),
        (3661, "1h 1m 1s"),
    ],
)
def test_format_duration(seconds, expected):
    assert main.format_duration(seconds) == expected


def test_detects_an_existing_mp3(tmp_path):
    (tmp_path / "video-1.mp3").touch()

    assert main.is_already_downloaded("video-1", tmp_path)
    assert not main.is_already_downloaded("video-2", tmp_path)


def test_get_latest_videos_normalizes_youtube_result(monkeypatch):
    class FakeYoutubeDL:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def extract_info(self, url, download):
            assert url.endswith("/@zgrzytpodcast/videos")
            assert download is False
            return {
                "entries": [
                    {"id": "abc", "title": "Odcinek", "upload_date": "20260905"}
                ]
            }

    monkeypatch.setattr(main.yt_dlp, "YoutubeDL", FakeYoutubeDL)

    assert main.get_latest_videos(limit=1) == [
        {
            "title": "Odcinek",
            "video_id": "abc",
            "url": "https://www.youtube.com/watch?v=abc",
            "publish_date": "20260905",
        }
    ]


def test_download_retries_a_temporary_error(monkeypatch, tmp_path):
    calls = 0
    waits = []

    class FakeYoutubeDL:
        def __init__(self, _):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def download(self, urls):
            nonlocal calls
            calls += 1
            assert urls == ["https://example.test/video"]
            if calls == 1:
                raise main.yt_dlp.utils.DownloadError("temporary failure")
            return 0

    monkeypatch.setattr(main.yt_dlp, "YoutubeDL", FakeYoutubeDL)
    monkeypatch.setattr(main.time, "sleep", waits.append)
    monkeypatch.setenv("DOWNLOAD_RETRIES", "3")

    stats = main.download_audio(
        [
            {
                "title": "Odcinek",
                "video_id": "abc",
                "url": "https://example.test/video",
                "publish_date": "20260905",
            }
        ],
        tmp_path,
    )

    assert calls == 2
    assert waits == [10]
    assert stats == {"downloaded": 1, "skipped": 0, "unavailable": 0, "failed": 0}
