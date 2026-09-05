FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /uvx /bin/

RUN useradd -m appuser

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

COPY main.py /app/

ENV PATH="/app/.venv/bin:${PATH}"

USER appuser

CMD ["python", "/app/main.py"]
