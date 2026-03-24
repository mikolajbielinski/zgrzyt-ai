FROM python:3.14-slim

WORKDIR /app

RUN apt-get update && apt-get -y install ffmpeg

COPY requirements.txt main.py /app/

RUN pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir /podcasts

RUN useradd podcastUser

RUN chown podcastUser /podcasts

USER podcastUser

CMD ["python", "/app/main.py"]