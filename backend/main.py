import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel
from qdrant_client import QdrantClient
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
qdrant_client = QdrantClient(url=cfg["qdrant_url"])

SYSTEM_PROMPT = (
    "Jesteś asystentem podcastu ZGRZYT prowadzonego przez Gimpera i Revo. "
    "Odpowiadasz po polsku na pytania o podcast. "
    "Poniżej znajdują się fragmenty transkrypcji odcinków, które mogą być "
    "powiązane z pytaniem użytkownika. Wykorzystaj je aby odpowiedzieć jak "
    "najdokładniej. Cytuj kto co powiedział i podawaj kontekst. "
    "Jeśli fragmenty nie zawierają odpowiedzi, powiedz że nie znalazłeś "
    "informacji w dostępnych odcinkach.\n\n"
    "FRAGMENTY TRANSKRYPCJI:\n{context}"
)

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


class AskResponse(BaseModel):
    answer: str


def search_qdrant(query: str) -> str:
    response = openai_client.embeddings.create(
        model=cfg["embedding_model"], input=query
    )
    query_vector = response.data[0].embedding

    results = qdrant_client.query_points(
        collection_name=cfg["collection_name"],
        query=query_vector,
        limit=cfg["search_limit"],
    )

    if not results.points:
        return "Brak wyników w bazie wiedzy."

    chunks = []
    for point in results.points:
        payload = point.payload
        youtube_url = f"https://youtube.com/watch?v={payload['youtube_id']}"
        minutes = int(payload["start"] // 60)
        seconds = int(payload["start"] % 60)
        header = f"[Odcinek: {youtube_url} | Czas: {minutes}:{seconds:02d}]"
        chunks.append(f"{header}\n{payload['text']}")

    return "\n\n---\n\n".join(chunks)


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="Brak wiadomości")

    last_user_message = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), None
    )
    if not last_user_message:
        raise HTTPException(status_code=400, detail="Brak wiadomości od użytkownika")

    context = search_qdrant(last_user_message)
    system_prompt = SYSTEM_PROMPT.format(context=context)

    try:
        response = openai_client.chat.completions.create(
            model=cfg["chat_model"],
            messages=[
                {"role": "system", "content": system_prompt},
                *[{"role": m.role, "content": m.content} for m in req.messages],
            ],
        )
    except OpenAIError as e:
        raise HTTPException(status_code=502, detail=f"Błąd OpenAI: {e}")

    answer = response.choices[0].message.content or ""
    return AskResponse(answer=answer)
