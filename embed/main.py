import json
import logging
import os
import uuid

import boto3
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

REQUIRED_ENV_VARS = [
    "S3_BUCKET",
    "S3_PREFIX",
    "QDRANT_URL",
    "COLLECTION_NAME",
    "CHUNK_MAX_TOKENS",
    "EMBEDDING_MODEL",
    "VECTOR_SIZE",
    "EMBED_BATCH_SIZE",
    "OPENAI_API_KEY",
]


def load_config():
    missing = [var for var in REQUIRED_ENV_VARS if var not in os.environ]
    if missing:
        log.error("Missing required environment variables: %s", ", ".join(missing))
        raise SystemExit(1)

    return {
        "s3_bucket": os.environ["S3_BUCKET"],
        "s3_prefix": os.environ["S3_PREFIX"].rstrip("/") + "/",
        "qdrant_url": os.environ["QDRANT_URL"],
        "collection_name": os.environ["COLLECTION_NAME"],
        "chunk_max_tokens": int(os.environ["CHUNK_MAX_TOKENS"]),
        "embedding_model": os.environ["EMBEDDING_MODEL"],
        "vector_size": int(os.environ["VECTOR_SIZE"]),
        "embed_batch_size": int(os.environ["EMBED_BATCH_SIZE"]),
    }


def list_transcripts(s3, cfg):
    prefix = cfg["s3_prefix"]
    ids = []
    for page in s3.get_paginator("list_objects_v2").paginate(
        Bucket=cfg["s3_bucket"], Prefix=prefix
    ):
        for obj in page.get("Contents", []):
            name = obj["Key"][len(prefix) :]
            if name.endswith(".json") and "/" not in name:
                ids.append(name.removesuffix(".json"))
    return ids


def is_processed(qdrant, cfg, youtube_id):
    result = qdrant.count(
        collection_name=cfg["collection_name"],
        count_filter=Filter(
            must=[
                FieldCondition(key="youtube_id", match=MatchValue(value=youtube_id))
            ]
        ),
    )
    return result.count > 0


def load_transcript(s3, cfg, youtube_id):
    key = f"{cfg['s3_prefix']}{youtube_id}.json"
    body = s3.get_object(Bucket=cfg["s3_bucket"], Key=key)["Body"].read()
    return json.loads(body)


def chunk_transcript(segments, youtube_id, max_tokens, tokenizer):
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

    chunks = []
    chunk_utterances = []
    chunk_tokens = 0

    for utt in utterances:
        formatted = f"[{utt['speaker']}]: {utt['text']}"
        utt_tokens = len(tokenizer.encode(formatted))

        if chunk_tokens + utt_tokens > max_tokens and chunk_utterances:
            chunks.append(_build_chunk(chunk_utterances, youtube_id, len(chunks)))
            last = chunk_utterances[-1]
            chunk_utterances = [last]
            chunk_tokens = last["tokens"]

        chunk_tokens += utt_tokens
        chunk_utterances.append({**utt, "formatted": formatted, "tokens": utt_tokens})

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


def embed_texts(openai_client, cfg, texts):
    all_embeddings = []
    for i in range(0, len(texts), cfg["embed_batch_size"]):
        batch = texts[i : i + cfg["embed_batch_size"]]
        response = openai_client.embeddings.create(
            model=cfg["embedding_model"], input=batch
        )
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings


def ensure_collection(qdrant, cfg):
    collections = [c.name for c in qdrant.get_collections().collections]
    if cfg["collection_name"] not in collections:
        qdrant.create_collection(
            collection_name=cfg["collection_name"],
            vectors_config=VectorParams(
                size=cfg["vector_size"], distance=Distance.COSINE
            ),
        )
        log.info("Created collection '%s'", cfg["collection_name"])


def store_chunks(qdrant, cfg, chunks, embeddings):
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
        qdrant.upsert(collection_name=cfg["collection_name"], points=points[i : i + 100])


def main():
    cfg = load_config()

    s3 = boto3.client("s3")
    qdrant = QdrantClient(url=cfg["qdrant_url"])
    openai_client = OpenAI()
    tokenizer = tiktoken.encoding_for_model(cfg["embedding_model"])

    ensure_collection(qdrant, cfg)

    transcript_ids = list_transcripts(s3, cfg)
    log.info("Found %d transcripts in s3://%s/%s", len(transcript_ids), cfg["s3_bucket"], cfg["s3_prefix"])

    new_ids = [tid for tid in transcript_ids if not is_processed(qdrant, cfg, tid)]
    log.info("New transcripts to process: %d", len(new_ids))

    for i, youtube_id in enumerate(new_ids, 1):
        log.info("[%d/%d] Processing %s", i, len(new_ids), youtube_id)

        segments = load_transcript(s3, cfg, youtube_id)
        chunks = chunk_transcript(
            segments, youtube_id, cfg["chunk_max_tokens"], tokenizer
        )
        log.info("  %d chunks", len(chunks))

        texts = [c["text"] for c in chunks]
        embeddings = embed_texts(openai_client, cfg, texts)

        store_chunks(qdrant, cfg, chunks, embeddings)
        log.info("  Stored in Qdrant")

    log.info("Done!")


if __name__ == "__main__":
    main()
