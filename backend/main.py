import json as json_module
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchText,
    TextIndexParams,
    TokenizerType,
)
from typing import Literal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

REQUIRED_ENV_VARS = [
    "OPENAI_API_KEY",
    "QDRANT_URL",
    "COLLECTION_NAME",
    "EMBEDDING_MODEL",
    "CHAT_MODEL",
    "SEARCH_LIMIT",
]


def load_config():
    missing = [var for var in REQUIRED_ENV_VARS if var not in os.environ]
    if missing:
        log.error("Missing required environment variables: %s", ", ".join(missing))
        raise SystemExit(1)

    return {
        "qdrant_url": os.environ["QDRANT_URL"],
        "collection_name": os.environ["COLLECTION_NAME"],
        "embedding_model": os.environ["EMBEDDING_MODEL"],
        "chat_model": os.environ["CHAT_MODEL"],
        "search_limit": int(os.environ["SEARCH_LIMIT"]),
    }


cfg = load_config()

openai_client = OpenAI()
qdrant = QdrantClient(url=cfg["qdrant_url"])

QUERY_EXPANSION_PROMPT = (
    "Użytkownik zadaje pytanie dotyczące podcastu ZGRZYT. "
    "Wygeneruj 3 różne zapytania wyszukiwania które pomogą znaleźć "
    "odpowiednie fragmenty transkrypcji. Uwzględnij synonimy, parafrazy "
    "i powiązane konteksty. Wyodrębnij też kluczowe frazy do wyszukiwania "
    "dosłownego (dokładne nazwy, terminy, wyrażenia z pytania).\n\n"
    'Odpowiedz TYLKO w formacie JSON:\n'
    '{"queries": ["zapytanie 1", "zapytanie 2", "zapytanie 3"], '
    '"keywords": ["fraza 1", "fraza 2"]}'
)

SYSTEM_PROMPT = """\
Jesteś ekspertem od podcastu ZGRZYT prowadzonego przez Gimpera i Revo.

ZASADY:
1. Odpowiadaj WYŁĄCZNIE na podstawie dostarczonych fragmentów transkrypcji
2. Odpowiedz swoimi słowami, nie kopiuj całych fragmentów
3. Zacytuj maksymalnie 2-3 kluczowe zdania w formacie: **Gimper**: "cytat" lub **Revo**: "cytat"
4. Podawaj link do odcinka z timestampem: [Obejrzyj fragment](URL)
5. Jeśli temat pojawia się w wielu fragmentach, opisz WSZYSTKIE znalezione wystąpienia
6. Jeśli fragmenty nie zawierają odpowiedzi, powiedz wprost że nie znalazłeś informacji
7. NIE wymyślaj informacji których nie ma w fragmentach
8. Odpowiadaj po polsku, w naturalny i przystępny sposób
9. Używaj markdown do formatowania odpowiedzi"""

app = FastAPI(title="ZGRZYT AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    messages: list[ChatMessage]


class Source(BaseModel):
    youtube_url: str
    timestamp: str
    text: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


def ensure_text_index():
    try:
        qdrant.create_payload_index(
            collection_name=cfg["collection_name"],
            field_name="text",
            field_schema=TextIndexParams(
                type="text",
                tokenizer=TokenizerType.WORD,
                min_token_len=2,
                max_token_len=30,
                lowercase=True,
            ),
        )
        log.info("Created text index on 'text' field")
    except Exception:
        log.info("Text index already exists")


def expand_query(user_query: str) -> dict:
    try:
        response = openai_client.chat.completions.create(
            model=cfg["chat_model"],
            messages=[
                {"role": "system", "content": QUERY_EXPANSION_PROMPT},
                {"role": "user", "content": user_query},
            ],
            response_format={"type": "json_object"},
        )
        return json_module.loads(response.choices[0].message.content)
    except Exception as e:
        log.warning("Query expansion failed: %s", e)
        return {"queries": [], "keywords": []}


def search_qdrant(query: str) -> tuple[str, list[Source]]:
    expanded = expand_query(query)
    all_queries = [query] + expanded.get("queries", [])
    keywords = expanded.get("keywords", [])

    log.info("Searching with %d queries + %d keywords", len(all_queries), len(keywords))

    seen_ids = set()
    results = []

    # Vector search with all queries (batched embedding)
    embeddings_response = openai_client.embeddings.create(
        model=cfg["embedding_model"], input=all_queries
    )
    for emb_data in embeddings_response.data:
        vector = emb_data.embedding
        hits = qdrant.query_points(
            collection_name=cfg["collection_name"],
            query=vector,
            limit=cfg["search_limit"],
        )
        for point in hits.points:
            if point.id not in seen_ids:
                seen_ids.add(point.id)
                results.append(point)

    # Keyword search for exact phrase matching
    for keyword in keywords:
        try:
            hits, _ = qdrant.scroll(
                collection_name=cfg["collection_name"],
                scroll_filter=Filter(
                    must=[FieldCondition(key="text", match=MatchText(text=keyword))]
                ),
                limit=cfg["search_limit"],
            )
            for point in hits:
                if point.id not in seen_ids:
                    seen_ids.add(point.id)
                    results.append(point)
        except Exception as e:
            log.warning("Keyword search failed for '%s': %s", keyword, e)

    log.info("Found %d unique chunks", len(results))

    if not results:
        return "Brak wyników w bazie wiedzy.", []

    chunks = []
    sources = []
    for point in results:
        payload = point.payload
        start_seconds = int(payload["start"])
        youtube_url = f"https://youtube.com/watch?v={payload['youtube_id']}&t={start_seconds}s"
        minutes = int(payload["start"] // 60)
        seconds = int(payload["start"] % 60)
        timestamp = f"{minutes}:{seconds:02d}"
        header = f"[Odcinek: {youtube_url} | Czas: {timestamp}]"
        chunks.append(f"{header}\n{payload['text']}")
        sources.append(Source(
            youtube_url=youtube_url,
            timestamp=timestamp,
            text=payload["text"][:200],
        ))

    return "\n\n---\n\n".join(chunks), sources


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="Brak wiadomości")

    last_user_message = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), None
    )
    if not last_user_message:
        raise HTTPException(status_code=400, detail="Brak wiadomości od użytkownika")

    context, sources = search_qdrant(last_user_message)

    try:
        response = openai_client.chat.completions.create(
            model=cfg["chat_model"],
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": f"FRAGMENTY TRANSKRYPCJI:\n\n{context}"},
                *[{"role": m.role, "content": m.content} for m in req.messages],
            ],
        )
    except OpenAIError as e:
        raise HTTPException(status_code=502, detail=f"Błąd OpenAI: {e}")

    answer = response.choices[0].message.content or ""
    return AskResponse(answer=answer, sources=sources)


ensure_text_index()
