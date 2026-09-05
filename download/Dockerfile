FROM python:3.14-slim

ARG DENO_VERSION=2.9.5

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /uvx /bin/

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl unzip \
    && curl -fsSL -o /tmp/deno.zip \
        "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" \
    && unzip -q /tmp/deno.zip -d /usr/local/bin \
    && chmod 755 /usr/local/bin/deno \
    && rm /tmp/deno.zip \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV DENO_DIR=/tmp/deno

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

COPY main.py /app/

RUN mkdir /podcasts

RUN useradd podcastUser

RUN chown podcastUser /podcasts

ENV PATH="/app/.venv/bin:${PATH}"

USER podcastUser

CMD ["python", "/app/main.py"]
