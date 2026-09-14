import json as json_module
import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request
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
        "max_daily_requests": int(os.environ.get("MAX_DAILY_REQUESTS", "100")),
        "max_daily_per_ip": int(os.environ.get("MAX_DAILY_PER_IP", "5")),
        "max_message_length": int(os.environ.get("MAX_MESSAGE_LENGTH", "500")),
        "max_messages": int(os.environ.get("MAX_MESSAGES", "20")),
    }


cfg = load_config()

openai_client = OpenAI(timeout=30.0)
qdrant = QdrantClient(url=cfg["qdrant_url"])


POLAND_TZ = ZoneInfo("Europe/Warsaw")


class RateLimiter:
    def __init__(self):
        self.global_count = 0
        self.ip_counts: dict[str, int] = defaultdict(int)
        self.current_period = self._period()

    @staticmethod
    def _period() -> str:
        now = datetime.now(POLAND_TZ)
        if now.hour < 17:
            return (now.date() - timedelta(days=1)).isoformat()
        return now.date().isoformat()

    def _maybe_reset(self):
        period = self._period()
        if period != self.current_period:
            self.global_count = 0
            self.ip_counts.clear()
            self.current_period = period

    def check(self, ip: str) -> str | None:
        self._maybe_reset()
        if self.global_count >= cfg["max_daily_requests"]:
            return "global"
        if self.ip_counts[ip] >= cfg["max_daily_per_ip"]:
            return "ip"
        return None

    def increment(self, ip: str):
        self._maybe_reset()
        self.global_count += 1
        self.ip_counts[ip] += 1

    def remaining(self, ip: str) -> tuple[int, int]:
        self._maybe_reset()
        user_left = max(0, cfg["max_daily_per_ip"] - self.ip_counts[ip])
        global_left = max(0, cfg["max_daily_requests"] - self.global_count)
        return user_left, global_left


rate_limiter = RateLimiter()


def get_client_ip(request: Request) -> str:
    return request.headers.get("X-Real-IP") or request.client.host


QUERY_EXPANSION_PROMPT = (
    "Użytkownik zadaje pytanie dotyczące podcastu ZGRZYT. "
    "Wygeneruj 3 różne zapytania wyszukiwania które pomogą znaleźć "
    "odpowiednie fragmenty transkrypcji. Uwzględnij synonimy, parafrazy "
    "i powiązane konteksty. Wyodrębnij też kluczowe frazy do wyszukiwania "
    "dosłownego (dokładne nazwy, terminy, wyrażenia z pytania).\n\n"
    "Odpowiedz TYLKO w formacie JSON:\n"
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
9. Używaj markdown do formatowania odpowiedzi

KOREKTY TRANSKRYPCJI (błędy rozpoznawania mowy):
- "Seili", "Salee", "Sayli" → prawidłowa nazwa to **Saily** (aplikacja do eSIM)"""

app = FastAPI(
    title="ZGRZYT AI Backend",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    messages: list[ChatMessage]


class AskResponse(BaseModel):
    answer: str


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


def search_qdrant(query: str) -> str:
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
        return "Brak wyników w bazie wiedzy."

    chunks = []
    for point in results:
        payload = point.payload
        start_seconds = int(payload["start"])
        youtube_url = (
            f"https://youtube.com/watch?v={payload['youtube_id']}&t={start_seconds}s"
        )
        minutes = int(payload["start"] // 60)
        seconds = int(payload["start"] % 60)
        header = f"[Odcinek: {youtube_url} | Czas: {minutes}:{seconds:02d}]"
        chunks.append(f"{header}\n{payload['text']}")

    return "\n\n---\n\n".join(chunks)


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, request: Request) -> AskResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="Brak wiadomości")

    # Rate limiting
    client_ip = get_client_ip(request)
    limit_type = rate_limiter.check(client_ip)
    if limit_type == "global":
        raise HTTPException(
            status_code=429,
            detail="Dzienny limit zapytań został wyczerpany. Spróbuj jutro.",
        )
    if limit_type == "ip":
        raise HTTPException(
            status_code=429,
            detail="Osiągnąłeś dzienny limit zapytań. Zresetuj sesję i spróbuj jutro.",
        )

    # Message count limit
    if len(req.messages) > cfg["max_messages"]:
        raise HTTPException(
            status_code=400,
            detail="Za dużo wiadomości w sesji. Zresetuj sesję, aby kontynuować.",
        )

    # Content validation
    for msg in req.messages:
        msg.content = msg.content.strip()
        if not msg.content:
            raise HTTPException(status_code=400, detail="Wiadomość nie może być pusta.")
        if len(msg.content) > cfg["max_message_length"]:
            raise HTTPException(
                status_code=400,
                detail=f"Wiadomość jest za długa (max {cfg['max_message_length']} znaków).",
            )

    last_user_message = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), None
    )
    if not last_user_message:
        raise HTTPException(status_code=400, detail="Brak wiadomości od użytkownika")

    context = search_qdrant(last_user_message)

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
        log.error("OpenAI error: %s", type(e).__name__)
        raise HTTPException(
            status_code=502,
            detail="Wystąpił błąd podczas generowania odpowiedzi. Spróbuj ponownie.",
        )

    rate_limiter.increment(client_ip)

    answer = response.choices[0].message.content or ""
    return AskResponse(answer=answer)


@app.get("/limits")
async def limits(request: Request):
    client_ip = get_client_ip(request)
    user_left, global_left = rate_limiter.remaining(client_ip)
    return {"remaining_user": user_left, "remaining_global": global_left}


ensure_text_index()
