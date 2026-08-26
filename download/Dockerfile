FROM python:3.14-slim

ARG DENO_VERSION=2.9.5

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

COPY requirements.txt main.py /app/

RUN pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir /podcasts

RUN useradd podcastUser

RUN chown podcastUser /podcasts

USER podcastUser

CMD ["python", "/app/main.py"]
