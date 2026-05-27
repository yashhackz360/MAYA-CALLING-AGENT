# MantaRay AI — Deployment Guide

Complete setup guide for running the MantaRay AI calling agent — from fresh clone to live Twilio calls.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Multi-container orchestration |
| ngrok | Latest | Public HTTPS tunnel for Twilio webhooks |
| Node.js | 18+ | Frontend local dev only (not needed for Docker) |
| Python | 3.13+ | Backend local dev only (not needed for Docker) |

---

## Quick Start — Docker (Recommended)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/mantaray-ai.git
cd mantaray-ai

# Copy env template and fill in your credentials
cp .env.example .env
```

Edit `.env` with your actual keys (see **Environment Variables** below).

### 2. Expose backend publicly (Twilio requires HTTPS)

```bash
# In a separate terminal — keep this running throughout
ngrok http 8000
# Copy the https URL e.g. https://abc123.ngrok-free.app
```

Set `PUBLIC_BASE_URL=https://abc123.ngrok-free.app` in your `.env`.

### 3. Start everything

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API health check | http://localhost:8000/health |

The frontend is served via Nginx on port 3000. In Docker mode, `VITE_API_URL` is left empty — Nginx proxies `/api/*` and `/ws/*` to the backend container over the internal `mantaray-network`.

### 4. Stop

```bash
docker compose down
```

### 5. Useful Docker commands

```bash
# Tail backend logs (relay activity)
docker compose logs -f backend

# Tail frontend logs
docker compose logs -f frontend

# Rebuild after code changes
docker compose up --build

# Run in background
docker compose up -d --build

# Check container health
docker compose ps
```

---

## Environment Variables

Copy `.env.example` → `.env` and fill in:

```env
# ElevenLabs Conversational AI Agent
ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxx
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxx

# Twilio outbound calling
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app

# xAI Grok (post-call transcript analysis — optional)
XAI_API_KEY=xai-xxxxxxxxxxxxxxxxxxxxxxxx

# Razorpay billing (optional)
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
```

### Where to get each key

| Key | Source |
|---|---|
| `ELEVENLABS_AGENT_ID` | elevenlabs.io → Conversational AI → your agent → copy Agent ID |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Settings → API Keys |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | console.twilio.com → Account Info |
| `TWILIO_FROM_NUMBER` | Twilio console → Phone Numbers → your number (E.164 format e.g. +14155551234) |
| `PUBLIC_BASE_URL` | Run `ngrok http 8000` → copy the `https://` URL |
| `XAI_API_KEY` | console.x.ai → API Keys |

---

## ElevenLabs Agent Setup

The ElevenLabs Conversational Agent must be configured in the ElevenLabs dashboard before use:

1. Go to elevenlabs.io → Conversational AI → Create Agent
2. **Voice:** Set to Tara (`rfh7WrTVqLIjVSioJwdI`) or any preferred voice
3. **System Prompt:** Add Maya's Škoda persona with all `{{variable}}` placeholders:
   - Core customer context: `{{customer_name}}`, `{{vehicle_interest}}`, `{{budget}}`, `{{transmission}}`, `{{location}}`, `{{enquiry_type}}`, `{{purpose}}`, `{{lead_tag}}`, `{{notes}}`
   - **Dealership Intelligence (v3.1):** `{{dealer_info}}`, `{{inventory_status}}`, `{{current_offers}}`, `{{appointment_prompt}}`, `{{city_served}}`
   - See `VOICE_AGENT_DEEP_DIVE.md` for the complete system prompt text
4. **First Message:** Leave blank — overridden per-call from `twilio_handler.py`
5. **Dynamic Variables:** Ensure the agent is set to accept dynamic variables (enabled by default in EL)
6. Copy the **Agent ID** → set as `ELEVENLABS_AGENT_ID` in `.env`

**Important:** All 14 `{{variables}}` are injected per-call by `_build_dynamic_variables()` in `twilio_handler.py`. The first message and voice are also overridden per-call. The 5 Dealership Intelligence variables are built from `backend/data/dealerships.py` based on the lead's city and vehicle model — no external API call required.

---

## Dealership Intelligence — No Setup Required

The Dealership Intelligence Layer (`backend/data/dealerships.py`) is a self-contained static dataset. It requires **no external service, no database, and no API key**.

To verify it is working after startup:

```bash
# Check supported cities
curl http://localhost:8000/api/dealerships/cities

# Get dealerships for a city
curl "http://localhost:8000/api/dealerships?city=bangalore"

# Get AI context for a city + model
curl "http://localhost:8000/api/dealer-intelligence?city=Bangalore&model=Škoda Kushaq"

# Get inventory for a model
curl "http://localhost:8000/api/inventory?model=Škoda Kushaq"
```

Expected response from `/api/dealerships/cities`:
```json
{"cities": ["ahmedabad", "bangalore", "chennai", "delhi", "hyderabad", "jaipur", "kochi", "kolkata", "mumbai", "pune"]}
```

---

## Twilio Setup

1. Create/log in at console.twilio.com
2. Buy or use an existing phone number → Phone Numbers
3. No webhook configuration needed — the agent sets up the stream URL dynamically via TwiML returned by `POST /twilio/voice`
4. Ensure your account has outbound calling permissions for India (+91) if calling Indian numbers
5. Record calls: the `record=True` parameter is passed to `calls.create()` — no dashboard config needed

---

## Local Development (without Docker)

### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — fill in all required keys

# Start backend
uvicorn main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install

# Set API URL for local dev (optional — defaults to localhost:8000)
# Create frontend/.env:
# VITE_API_URL=http://localhost:8000

npm run dev
# Opens at http://localhost:5173
```

---

## Windows Convenience Scripts

The repository includes batch files for Windows:

| Script | What It Does |
|---|---|
| `start.bat` | Opens two terminal windows — backend + frontend |
| `start_backend.bat` | Activates venv and starts uvicorn |
| `start_frontend.bat` | Runs npm run dev |

---

## Call Flow Verification

Once running, test end-to-end:

1. Open dashboard at `http://localhost:3000` → log in (`admin` / `admin123`)
2. Navigate to `/enquiry` (public form — no login required)
3. Submit a test lead with **your own phone number** and `contact_consent = true`
4. You should receive a call from your Twilio number within ~5 seconds
5. Maya introduces herself in the selected language and starts the Škoda discovery conversation
6. Say goodbye — Maya detects it and hangs up
7. Call log appears in `/call-logs` after the call ends
8. After ~30–90 seconds: recording SID and AI analysis populated (if xAI key set)

---

## Docker Image Details

### Backend (`mantaray-backend:latest`)

```dockerfile
FROM python:3.13-slim
# apt: curl (healthcheck), gcc + python3-dev (audioop-lts native build)
# pip: requirements.txt
# Non-root user: mantaray
# CMD: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

**Why `--workers 1`?** The in-memory `_leads_db` and `_call_logs` lists and the `_sid_to_lead` WebSocket state dict are process-local. Multiple workers would have independent in-memory stores, causing leads to appear/disappear depending on which worker handles the request. Single worker is required until a persistent database is added.

Base image: `python:3.13-slim` (~350 MB with deps)

### Frontend (`mantaray-frontend:latest`)

```dockerfile
# Stage 1: node:20-alpine — npm ci + npm run build → dist/
# Stage 2: nginx:alpine — copy dist/ + nginx.conf
```

`VITE_API_URL` is set empty at build time in Docker mode. Nginx rewrites `/api/*` and `/ws/*` requests to `http://backend:8000` over the internal Docker network.

Base image after build: `nginx:alpine` (~25 MB)

### Network

Both containers share `mantaray-network` (bridge). The frontend container reaches the backend as `http://backend:8000` (Docker internal DNS). Port `8000` is also exposed to the host for ngrok.

### Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s
```

The frontend `depends_on: backend: condition: service_healthy` — frontend won't start until backend passes health check.

---

## Production Deployment

For production (beyond ngrok), replace ngrok with a stable public HTTPS URL.

### Option A — VPS with Nginx reverse proxy

```bash
# On your server (Ubuntu 22.04+)
git clone https://github.com/your-org/mantaray-ai.git
cd mantaray-ai

# Configure environment
cp .env.example .env
nano .env
# Set PUBLIC_BASE_URL=https://api.yourdomain.com

# Start in background
docker compose up -d --build
```

Configure Nginx on the host as a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

WebSocket upgrade headers are required for Twilio Media Streams and the `/ws/crm` endpoint.

### Option B — Railway / Render / Fly.io

These platforms provide automatic HTTPS. Deploy backend and frontend as separate services. Set all environment variables in the platform dashboard.

- Set `PUBLIC_BASE_URL` to the backend's auto-provisioned HTTPS URL
- Set `VITE_API_URL` to the same backend URL for frontend builds (or use relative proxy)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Twilio call not received | `PUBLIC_BASE_URL` wrong or ngrok expired | Update ngrok URL in `.env` and restart backend |
| "Configuration error" TwiML voice | `PUBLIC_BASE_URL` empty | Check `.env` — must be set before starting |
| ElevenLabs not connecting | `ELEVENLABS_AGENT_ID` wrong | Verify Agent ID in EL dashboard matches `.env` |
| Call connects but no audio | `audioop-lts` not installed | Rebuild Docker image: `docker compose up --build` |
| Call hangs up immediately after answer | Backend not reachable from Twilio | Verify ngrok tunnel running: `ngrok http 8000` |
| Dashboard shows no leads | Backend not running or CORS | Check `docker compose logs backend` for errors |
| Frontend shows API error | `VITE_API_URL` wrong (local dev) | Set to `http://localhost:8000` in `frontend/.env` |
| No post-call AI analysis | `XAI_API_KEY` not set or invalid | Check `.env` — analysis is silently skipped if key missing |
| Recording SID missing | Recording not yet processed | Wait 30–90s after call ends — Twilio processes asynchronously |
| `audioop ModuleNotFoundError` | Python 3.13 removed stdlib `audioop` | Install `audioop-lts` (already in requirements.txt) |
| Frontend blank page in Docker | Nginx config issue | Check `docker compose logs frontend` |
| `/api/dealer-intelligence` returns 422 | Missing `city` query param | `city` is required — `model` is optional |
| Dealer info shows generic fallback | City not in supported list | Use `/api/dealerships/cities` to check supported cities; add alias to `_CITY_ALIASES` |
| Inventory shows generic fallback | Model name not matched | Use `/api/inventory` to see exact model names; check `_MODEL_ALIASES` in dealerships.py |

---

## Security Notes for Production

- **Restrict CORS** — remove `"*"` from `allow_origins` in `main.py`, set your exact domain
- **Add Twilio webhook signature validation** — verify `X-Twilio-Signature` header on `/twilio/voice`
- **Replace sessionStorage auth** — implement JWT or OAuth2 instead of demo credentials
- **Use secrets manager** — do not commit `.env` files; use Docker secrets or platform env var management
- **Run behind TLS** — never expose the backend directly on HTTP to the internet
