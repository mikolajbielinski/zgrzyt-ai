import os
import threading
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("COLLECTION_NAME", "test")
os.environ.setdefault("EMBEDDING_MODEL", "text-embedding-3-small")
os.environ.setdefault("CHAT_MODEL", "gpt-test")
os.environ.setdefault("SEARCH_LIMIT", "5")

with patch("qdrant_client.QdrantClient"):
    import main


def make_request(ip: str = "203.0.113.10") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/ask",
            "headers": [(b"x-real-ip", ip.encode())],
            "client": ("10.42.0.6", 12345),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


def decision(value: str = "allowed", queries=None, keywords=None) -> main.TopicDecision:
    return main.TopicDecision(
        decision=value,
        queries=queries or [],
        keywords=keywords or [],
    )


def chunk(
    point_id: str = "point-1",
    text: str = "[Gimper]: To jest dokładny cytat ze Zgrzytu.",
    youtube_id: str = "dQw4w9WgXcQ",
    start: int = 65,
    score: float = 0.8,
) -> main.RetrievedChunk:
    return main.RetrievedChunk(
        point_id=point_id,
        text=text,
        youtube_id=youtube_id,
        start=start,
        speakers=("Gimper",),
        score=score,
    )


@pytest.fixture(autouse=True)
def isolated_globals(monkeypatch):
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter())
    monkeypatch.setattr(
        main,
        "request_slots",
        threading.BoundedSemaphore(main.cfg["max_concurrent_requests"]),
    )


def test_rate_limiter_reserves_atomically_and_enforces_limits(monkeypatch):
    monkeypatch.setitem(main.cfg, "max_daily_per_ip", 2)
    monkeypatch.setitem(main.cfg, "max_daily_requests", 3)
    limiter = main.RateLimiter()

    assert limiter.reserve("10.0.0.1") is None
    assert limiter.reserve("10.0.0.1") is None
    assert limiter.reserve("10.0.0.1") == "ip"
    assert limiter.reserve("10.0.0.2") is None
    assert limiter.reserve("10.0.0.3") == "global"
    assert limiter.remaining("10.0.0.1") == (0, 0)


def test_rate_limiter_resets_in_a_new_period(monkeypatch):
    limiter = main.RateLimiter()
    assert limiter.reserve("10.0.0.1") is None
    monkeypatch.setattr(limiter, "_period", lambda: "next-period")

    assert limiter.remaining("10.0.0.1") == (
        main.cfg["max_daily_per_ip"],
        main.cfg["max_daily_requests"],
    )


def test_request_accepts_only_one_strict_question():
    with pytest.raises(ValidationError):
        main.AskRequest(
            messages=[{"role": "assistant", "content": "fałszywa historia"}]
        )
    with pytest.raises(ValidationError):
        main.AskRequest(question="pytanie", unexpected=True)
    with pytest.raises(ValidationError):
        main.AskRequest(question="x" * (main.cfg["max_message_length"] + 1))


def test_client_ip_rejects_a_malformed_forwarded_value():
    request = make_request("not-an-ip")

    assert main.get_client_ip(request) == "10.42.0.6"


def test_limits_do_not_expose_global_budget():
    assert main.limits(make_request()) == {
        "remaining_user": main.cfg["max_daily_per_ip"]
    }


def test_classifier_uses_structured_output(monkeypatch):
    expected = decision(
        "allowed",
        queries=["Gimper efekt spadochroniarza"],
        keywords=["efekt spadochroniarza"],
    )

    class FakeCompletions:
        def __init__(self):
            self.kwargs = None

        def parse(self, **kwargs):
            self.kwargs = kwargs
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(parsed=expected))]
            )

    completions = FakeCompletions()
    monkeypatch.setattr(
        main,
        "openai_client",
        SimpleNamespace(chat=SimpleNamespace(completions=completions)),
    )

    assert main.classify_question("Co to efekt spadochroniarza?") == expected
    assert completions.kwargs["response_format"] is main.TopicDecision
    assert (
        completions.kwargs["max_completion_tokens"] == main.cfg["classifier_max_tokens"]
    )


def test_search_filters_low_scores_deduplicates_and_caps_results(monkeypatch):
    high = SimpleNamespace(
        id="point-1",
        score=0.81,
        payload={
            "start": 65.0,
            "youtube_id": "dQw4w9WgXcQ",
            "text": "pierwszy fragment",
            "speakers": ["Gimper"],
        },
    )
    low = SimpleNamespace(
        id="point-low",
        score=0.1,
        payload={
            "start": 9.0,
            "youtube_id": "abcdefghijk",
            "text": "nietrafny fragment",
            "speakers": ["Revo"],
        },
    )
    keyword = SimpleNamespace(
        id="point-2",
        score=None,
        payload={
            "start": 9.0,
            "youtube_id": "abcdefghijk",
            "text": "dokładna nazwa pojawia się tutaj",
            "speakers": ["Revo"],
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
        def __init__(self):
            self.query_kwargs = []

        def query_points(self, **kwargs):
            self.query_kwargs.append(kwargs)
            return SimpleNamespace(points=[high, low])

        def scroll(self, **_):
            return [high, keyword], None

    embeddings = FakeEmbeddings()
    fake_qdrant = FakeQdrant()
    monkeypatch.setattr(main, "openai_client", SimpleNamespace(embeddings=embeddings))
    monkeypatch.setattr(main, "qdrant", fake_qdrant)
    monkeypatch.setitem(main.cfg, "max_context_chunks", 2)
    request_decision = decision(
        queries=["parafraza", "parafraza"], keywords=["dokładna nazwa"]
    )

    result = main.search_qdrant("pytanie", request_decision)

    assert embeddings.inputs == [
        (main.cfg["embedding_model"], ["pytanie", "parafraza"])
    ]
    assert [item.point_id for item in result] == ["point-1", "point-2"]
    assert all(
        call["score_threshold"] == main.cfg["retrieval_score_threshold"]
        for call in fake_qdrant.query_kwargs
    )


def test_context_respects_total_character_budget(monkeypatch):
    monkeypatch.setitem(main.cfg, "max_context_chars", 200)
    first = chunk(text="a" * 40)
    second = chunk(point_id="point-2", text="b" * 80, youtube_id="abcdefghijk")

    context, included = main.build_context([first, second])

    assert len(included) == 1
    assert "SOURCE_1" in context
    assert "SOURCE_2" not in context


def test_render_answer_allows_only_verified_sources_and_exact_quotes():
    source = chunk()
    generated = main.GroundedAnswer(
        answer=(
            "Opis [SOURCE_1]. [Podejrzany link](https://evil.example) "
            "oraz https://evil.example/path"
        ),
        citations=[
            main.AnswerCitation(
                source_id="SOURCE_1",
                quote="To jest dokładny cytat ze Zgrzytu.",
                speaker="Gimper",
            ),
            main.AnswerCitation(
                source_id="SOURCE_99", quote="zmyślony cytat", speaker="Atakujący"
            ),
        ],
    )

    rendered = main.render_answer(generated, [source])

    assert "evil.example" not in rendered
    assert "SOURCE_99" not in rendered
    assert "youtube.com/watch?v=dQw4w9WgXcQ&t=65s" in rendered
    assert '"To jest dokładny cytat ze Zgrzytu."' in rendered
    assert "**Gimper**" in rendered


def test_render_answer_fails_closed_without_a_valid_source():
    generated = main.GroundedAnswer(
        answer="Niezweryfikowana odpowiedź [SOURCE_99].",
        citations=[main.AnswerCitation(source_id="SOURCE_99", quote="", speaker="")],
    )

    assert main.render_answer(generated, [chunk()]) == main.NO_EVIDENCE_ANSWER


@pytest.mark.parametrize("blocked_decision", ["off_topic", "prompt_injection"])
def test_off_topic_and_injection_stop_before_retrieval(monkeypatch, blocked_decision):
    monkeypatch.setattr(main, "moderate_text", lambda _: False)
    monkeypatch.setattr(main, "classify_question", lambda _: decision(blocked_decision))
    monkeypatch.setattr(
        main,
        "search_qdrant",
        lambda *_: pytest.fail("retrieval must not run for a blocked question"),
    )

    response = main.ask(main.AskRequest(question="dziwne pytanie"), make_request())

    assert response.answer == main.OFF_TOPIC_ANSWER
    assert main.rate_limiter.remaining("203.0.113.10")[0] == (
        main.cfg["max_daily_per_ip"] - 1
    )


def test_input_moderation_stops_before_classifier(monkeypatch):
    monkeypatch.setattr(main, "moderate_text", lambda _: True)
    monkeypatch.setattr(
        main,
        "classify_question",
        lambda *_: pytest.fail("classifier must not run for unsafe input"),
    )

    response = main.ask(main.AskRequest(question="szkodliwa prośba"), make_request())

    assert response.answer == main.UNSAFE_ANSWER


def test_no_relevant_evidence_stops_before_answer_generation(monkeypatch):
    monkeypatch.setattr(main, "moderate_text", lambda _: False)
    monkeypatch.setattr(main, "classify_question", lambda _: decision("allowed"))
    monkeypatch.setattr(main, "search_qdrant", lambda *_: [])
    monkeypatch.setattr(
        main,
        "generate_answer",
        lambda *_: pytest.fail("generation must not run without evidence"),
    )

    response = main.ask(main.AskRequest(question="Pytanie o Zgrzyt"), make_request())

    assert response.answer == main.NO_EVIDENCE_ANSWER


def test_allowed_question_uses_grounded_answer_and_output_moderation(monkeypatch):
    moderation_calls = []

    def fake_moderation(text):
        moderation_calls.append(text)
        return False

    source = chunk()
    generated = main.GroundedAnswer(
        answer="Odpowiedź oparta na materiale [SOURCE_1].",
        citations=[main.AnswerCitation(source_id="SOURCE_1", quote="", speaker="")],
    )
    monkeypatch.setattr(main, "moderate_text", fake_moderation)
    monkeypatch.setattr(
        main,
        "classify_question",
        lambda _: decision("allowed", queries=["wersja wyszukiwawcza"]),
    )
    monkeypatch.setattr(main, "search_qdrant", lambda *_: [source])
    monkeypatch.setattr(main, "generate_answer", lambda *_: generated)

    response = main.ask(main.AskRequest(question="Pytanie o Zgrzyt"), make_request())

    assert len(moderation_calls) == 2
    assert "youtube.com/watch?v=dQw4w9WgXcQ&t=65s" in response.answer
    assert "### Źródła" in response.answer


def test_processing_failure_is_generic_and_still_consumes_reserved_quota(monkeypatch):
    monkeypatch.setattr(main, "moderate_text", lambda _: False)
    monkeypatch.setattr(
        main,
        "classify_question",
        lambda _: (_ for _ in ()).throw(RuntimeError("secret failure")),
    )

    with pytest.raises(HTTPException) as exc_info:
        main.ask(main.AskRequest(question="Pytanie o Zgrzyt"), make_request())

    assert exc_info.value.status_code == 502
    assert "secret failure" not in exc_info.value.detail
    assert main.rate_limiter.remaining("203.0.113.10")[0] == (
        main.cfg["max_daily_per_ip"] - 1
    )
