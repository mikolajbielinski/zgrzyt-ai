FROM python:3.13-slim

RUN useradd -m appuser

WORKDIR /app

COPY requirements.txt main.py /app/

RUN pip install --no-cache-dir -r /app/requirements.txt

USER appuser

CMD ["python", "/app/main.py"]
