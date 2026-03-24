import json
import logging
import os
import subprocess
import uuid

import tiktoken
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

S3_BUCKET = os.environ["S3_BUCKET"]
S3_PREFIX = os.environ.get("S3_PREFIX", "transcripts/")
TRANSCRIPTS_DIR = os.environ.get("TRANSCRIPTS_DIR", "/transcripts")
QDRANT_URL = os.environ.get(
    "QDRANT_URL", "http://qdrant.zgrzyt-ai.svc.cluster.local:6333"
)
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "zgrzyt-transcripts")
CHUNK_MAX_TOKENS = int(os.environ.get("CHUNK_MAX_TOKENS", "500"))
EMBEDDING_MODEL = "text-embedding-3-large"
VECTOR_SIZE = 3072
EMBED_BATCH_SIZE = 100


def sync_transcripts_from_s3():
    source = f"s3://{S3_BUCKET}/{S3_PREFIX}"
    log.info("Syncing %s -> %s", source, TRANSCRIPTS_DIR)
    result = subprocess.run(
        ["aws", "s3", "sync", source, TRANSCRIPTS_DIR],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"S3 sync failed: {result.stderr}")
    if result.stdout.strip():
        log.info("S3 sync output:\n%s", result.stdout.strip())
    else:
        log.info("S3 sync: already up to date")


def list_local_transcripts():
    ids = []
    for filename in os.listdir(TRANSCRIPTS_DIR):
        if filename.endswith(".json"):
            youtube_id = filename.removesuffix(".json")
            ids.append(youtube_id)
    return ids


def is_processed(qdrant, youtube_id):
    result = qdrant.count(
        collection_name=COLLECTION_NAME,
        count_filter=Filter(
            must=[
                FieldCondition(key="youtube_id", match=MatchValue(value=youtube_id))
            ]
        ),
    )
    return result.count > 0


def load_transcript(youtube_id):
    path = os.path.join(TRANSCRIPTS_DIR, f"{youtube_id}.json")
    with open(path) as f:
        return json.load(f)


def chunk_transcript(segments, youtube_id, max_tokens, tokenizer):
    # Merge consecutive same-speaker segments into utterances
    utterances = []
    current = None
    for seg in segments:
        speaker = seg.get("speaker", "Unknown")
        text = seg.get("text", "").strip()
        if not text:
            continue
        if current and current["speaker"] == speaker:
            current["text"] += " " + text
            current["end"] = seg["end"]
        else:
            if current:
                utterances.append(current)
            current = {
                "speaker": speaker,
                "text": text,
                "start": seg["start"],
                "end": seg["end"],
            }
    if current:
        utterances.append(current)

    # Build chunks from utterances
    chunks = []
    chunk_utterances = []
    chunk_tokens = 0

    for utt in utterances:
        formatted = f"[{utt['speaker']}]: {utt['text']}"
        utt_tokens = len(tokenizer.encode(formatted))

        if chunk_tokens + utt_tokens > max_tokens and chunk_utterances:
            chunks.append(_build_chunk(chunk_utterances, youtube_id, len(chunks)))
            # Overlap: keep last utterance for context
            last = chunk_utterances[-1]
            chunk_utterances = [last]
            chunk_tokens = last["tokens"]
        else:
            chunk_tokens += utt_tokens

        chunk_utterances.append({**utt, "formatted": formatted, "tokens": utt_tokens})
        if chunk_tokens == 0:
            chunk_tokens = utt_tokens

    if chunk_utterances:
        chunks.append(_build_chunk(chunk_utterances, youtube_id, len(chunks)))

    return chunks


def _build_chunk(utterances, youtube_id, index):
    text = "\n".join(u["formatted"] for u in utterances)
    speakers = list({u["speaker"] for u in utterances})
    return {
        "text": text,
        "youtube_id": youtube_id,
        "chunk_index": index,
        "start": utterances[0]["start"],
        "end": utterances[-1]["end"],
        "speakers": speakers,
    }


def embed_texts(openai_client, texts):
    all_embeddings = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i : i + EMBED_BATCH_SIZE]
        response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings


def ensure_collection(qdrant):
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        log.info("Created collection '%s'", COLLECTION_NAME)


def store_chunks(qdrant, chunks, embeddings):
    points = []
    for chunk, embedding in zip(chunks, embeddings):
        point_id = str(
            uuid.uuid5(
                uuid.NAMESPACE_DNS, f"{chunk['youtube_id']}:{chunk['chunk_index']}"
            )
        )
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk["text"],
                    "youtube_id": chunk["youtube_id"],
                    "chunk_index": chunk["chunk_index"],
                    "start": chunk["start"],
                    "end": chunk["end"],
                    "speakers": chunk["speakers"],
                },
            )
        )

    for i in range(0, len(points), 100):
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points[i : i + 100])


def main():
    sync_transcripts_from_s3()

    qdrant = QdrantClient(url=QDRANT_URL)
    openai_client = OpenAI()
    tokenizer = tiktoken.encoding_for_model(EMBEDDING_MODEL)

    ensure_collection(qdrant)

    transcript_ids = list_local_transcripts()
    log.info("Found %d transcripts locally", len(transcript_ids))

    new_ids = [tid for tid in transcript_ids if not is_processed(qdrant, tid)]
    log.info("New transcripts to process: %d", len(new_ids))

    for i, youtube_id in enumerate(new_ids, 1):
        log.info("[%d/%d] Processing %s", i, len(new_ids), youtube_id)

        segments = load_transcript(youtube_id)
        chunks = chunk_transcript(segments, youtube_id, CHUNK_MAX_TOKENS, tokenizer)
        log.info("  %d chunks", len(chunks))

        texts = [c["text"] for c in chunks]
        embeddings = embed_texts(openai_client, texts)

        store_chunks(qdrant, chunks, embeddings)
        log.info("  Stored in Qdrant")

    log.info("Done!")


if __name__ == "__main__":
    main()
