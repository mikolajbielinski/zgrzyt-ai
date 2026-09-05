import os
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("COLLECTION_NAME", "test")
os.environ.setdefault("EMBEDDING_MODEL", "text-embedding-3-small")
os.environ.setdefault("CHAT_MODEL", "gpt-test")
os.environ.setdefault("SEARCH_LIMIT", "5")

with patch("qdrant_client.QdrantClient"):
    import main


def test_rate_limiter_enforces_per_ip_and_global_limits(monkeypatch):
    monkeypatch.setitem(main.cfg, "max_daily_per_ip", 2)
    monkeypatch.setitem(main.cfg, "max_daily_requests", 3)
    limiter = main.RateLimiter()

    limiter.increment("10.0.0.1")
    limiter.increment("10.0.0.1")
    assert limiter.check("10.0.0.1") == "ip"
    assert limiter.check("10.0.0.2") is None

    limiter.increment("10.0.0.2")
    assert limiter.check("10.0.0.3") == "global"
    assert limiter.remaining("10.0.0.1") == (0, 0)


def test_rate_limiter_resets_in_a_new_period(monkeypatch):
    limiter = main.RateLimiter()
    limiter.increment("10.0.0.1")
    monkeypatch.setattr(limiter, "_period", lambda: "next-period")

    assert limiter.remaining("10.0.0.1") == (
        main.cfg["max_daily_per_ip"],
        main.cfg["max_daily_requests"],
    )


def test_query_expansion_failure_has_safe_fallback(monkeypatch):
    class FailingCompletions:
        def create(self, **_):
            raise RuntimeError("offline")

    client = SimpleNamespace(chat=SimpleNamespace(completions=FailingCompletions()))
    monkeypatch.setattr(main, "openai_client", client)

    assert main.expand_query("pytanie") == {"queries": [], "keywords": []}


def test_search_combines_vector_and_keyword_results_without_duplicates(monkeypatch):
    first = SimpleNamespace(
        id="point-1",
        payload={
            "start": 65.0,
            "youtube_id": "video-1",
            "text": "pierwszy fragment",
        },
    )
    second = SimpleNamespace(
        id="point-2",
        payload={
            "start": 9.0,
            "youtube_id": "video-2",
            "text": "drugi fragment",
        },
    )

    class FakeEmbeddings:
        def __init__(self):
            self.inputs = []

        def create(self, *, model, input):
            self.inputs.append((model, input))
            return SimpleNamespace(
                data=[
                    SimpleNamespace(embedding=[index]) for index, _ in enumerate(input)
                ]
            )

    class FakeQdrant:
        def query_points(self, **_):
            return SimpleNamespace(points=[first])

        def scroll(self, **_):
            return [first, second], None

    embeddings = FakeEmbeddings()
    monkeypatch.setattr(
        main,
        "expand_query",
        lambda _: {"queries": ["parafraza"], "keywords": ["dokladna fraza"]},
    )
    monkeypatch.setattr(main, "openai_client", SimpleNamespace(embeddings=embeddings))
    monkeypatch.setattr(main, "qdrant", FakeQdrant())

    result = main.search_qdrant("pytanie")

    assert embeddings.inputs == [
        (main.cfg["embedding_model"], ["pytanie", "parafraza"])
    ]
    assert result.count("pierwszy fragment") == 1
    assert result.count("drugi fragment") == 1
    assert "youtube.com/watch?v=video-1&t=65s" in result
    assert "Czas: 1:05" in result
