# ─── MantaRay AI Backend — Production Dockerfile ──────────────────────────────
# Stack: FastAPI + Uvicorn + Twilio + ElevenLabs relay
# Python 3.13 slim — audioop-lts handles µ-law PCM transcoding

FROM python:3.13-slim

LABEL maintainer="MantaRay AI"
LABEL description="Škoda Auto India — AI Calling Agent Backend"
LABEL version="3.0.0"

# ── System deps ────────────────────────────────────────────────────────────────
# curl: healthcheck   gcc/python3-dev: audioop-lts native build
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python deps (cached layer) ─────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ── Application code ───────────────────────────────────────────────────────────
COPY . .

# ── Non-root user ──────────────────────────────────────────────────────────────
RUN groupadd -r mantaray && useradd -r -g mantaray -d /app mantaray \
    && chown -R mantaray:mantaray /app
USER mantaray

# ── Runtime ────────────────────────────────────────────────────────────────────
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Single worker — WebSocket relay state is process-local (in-memory leads store)
CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
