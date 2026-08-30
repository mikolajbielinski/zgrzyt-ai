import os

import pytest

os.environ.setdefault("S3_BUCKET", "test-bucket")
os.environ.setdefault("S3_PREFIX", "transcripts/labeled/")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("COLLECTION_NAME", "test")
os.environ.setdefault("CHUNK_MAX_TOKENS", "500")
os.environ.setdefault("EMBEDDING_MODEL", "text-embedding-3-large")
os.environ.setdefault("VECTOR_SIZE", "3072")
os.environ.setdefault("EMBED_BATCH_SIZE", "16")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import main  # noqa: E402


class WordTokenizer:
    """One token per whitespace-separated word. Deterministic, no network."""

    def encode(self, text):
        return text.split()


@pytest.fixture
def tokenizer():
    return WordTokenizer()


def segments(count, words_per_utterance, speaker_prefix="S"):
    return [
        {
            "speaker": f"{speaker_prefix}{i % 2}",
            "text": " ".join(f"w{i}x{j}" for j in range(words_per_utterance)),
            "start": float(i),
            "end": float(i) + 1.0,
        }
        for i in range(count)
    ]


def test_no_chunk_exceeds_the_limit(tokenizer):
    chunks = main.chunk_transcript(segments(20, 200), "vid", 500, tokenizer)
    assert chunks
    for chunk in chunks:
        assert len(tokenizer.encode(chunk["text"])) <= 500, chunk["chunk_index"]


def test_no_utterance_is_lost(tokenizer):
    segs = segments(20, 50)
    chunks = main.chunk_transcript(segs, "vid", 200, tokenizer)
    joined = " ".join(c["text"] for c in chunks)
    for seg in segs:
        for word in seg["text"].split():
            assert word in joined


def test_single_utterance_longer_than_limit(tokenizer):
    chunks = main.chunk_transcript(segments(1, 900), "vid", 100, tokenizer)
    assert len(chunks) == 1
    assert "w0x0" in chunks[0]["text"]


def test_chunks_are_indexed_and_carry_timestamps(tokenizer):
    chunks = main.chunk_transcript(segments(20, 100), "vid", 300, tokenizer)
    assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))
    for chunk in chunks:
        assert chunk["youtube_id"] == "vid"
        assert chunk["end"] >= chunk["start"]


def test_consecutive_segments_of_same_speaker_are_merged(tokenizer):
    segs = [
        {"speaker": "Gimper", "text": "raz", "start": 0.0, "end": 1.0},
        {"speaker": "Gimper", "text": "dwa", "start": 1.0, "end": 2.0},
        {"speaker": "Revo", "text": "trzy", "start": 2.0, "end": 3.0},
    ]
    chunks = main.chunk_transcript(segs, "vid", 1000, tokenizer)
    assert chunks[0]["text"] == "[Gimper]: raz dwa\n[Revo]: trzy"


def test_empty_segments_are_skipped(tokenizer):
    segs = [
        {"speaker": "A", "text": "   ", "start": 0.0, "end": 1.0},
        {"speaker": "A", "text": "tekst", "start": 1.0, "end": 2.0},
    ]
    chunks = main.chunk_transcript(segs, "vid", 1000, tokenizer)
    assert chunks[0]["text"] == "[A]: tekst"
