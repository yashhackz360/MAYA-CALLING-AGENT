# MantaRay AI — Backend (FastAPI v3)

FastAPI backend for the MantaRay AI calling agent. Handles Twilio outbound PSTN calls, relays bidirectional audio to the ElevenLabs Conversational Agent, broadcasts real-time lead events to the CRM dashboard, proxies Twilio recordings, and processes Razorpay payments.

---

## Directory Structure

```
backend/
├── main.py              # FastAPI app — REST endpoints, /ws/crm, Razorpay, health
├── twilio_handler.py    # Twilio webhook + Twilio ↔ ElevenLabs audio relay
├── requirements.txt     # Python dependencies
├── Dockerfile           # python:3.13-slim + audioop-lts native build
├── .env                 # API keys (git-ignored)
├── .env.example         # Template — copy to .env
├── twilio_relay.log     # Written at runtime — relay session logs
│
├── agent/
│   └── __init__.py      # Empty — Path B placeholder
│
├── call_manager/
│   └── __init__.py      # Empty — Path B placeholder
│
└── data/
    └── sample_leads.py  # In-memory lead store (CRUD, call logs, analytics, campaigns)
```

---

## Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — fill in all required keys

# Start server
uvicorn main:app --reload --port 8000
```

### Requirements

```
fastapi==0.115.0          # Web framework
uvicorn[standard]==0.30.6 # ASGI server (with websockets extra)
websockets>=13.0.1        # WebSocket client (ElevenLabs relay)
pydantic==2.9.2           # Request/response validation
python-dotenv==1.0.1      # .env file loading
twilio>=9.0.0             # Outbound PSTN calls + TwiML + recordings
audioop-lts>=0.2.1        # µ-law ↔ PCM transcoding (Python 3.13+ replacement for stdlib audioop)
razorpay>=1.4.0           # Payment gateway (optional)
httpx>=0.27.0             # Async HTTP client (xAI Grok + Twilio recording proxy)
```

---

## Environment Variables

```env
# ElevenLabs Conversational AI Agent
ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxx
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxx

# Twilio outbound calling
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app

# xAI Grok — post-call transcript analysis (optional)
XAI_API_KEY=xai-xxxxxxxxxxxxxxxxxxxxxxxx

# Razorpay billing (optional)
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
```

`PUBLIC_BASE_URL` must be a publicly reachable HTTPS URL. For local development, use ngrok:
```bash
ngrok http 8000
# Copy the https://... URL → set as PUBLIC_BASE_URL
```

---

## Architecture — Key Modules

### `main.py`

FastAPI application entry point. Contains:
- CORS middleware (allow_origins includes `*` for dev; restrict for production)
- All REST API routes
- `/ws/crm` WebSocket for CRM dashboard notifications
- Razorpay billing integration
- Includes `twilio_handler.router` via `app.include_router()`

```python
# App startup
app = FastAPI(title="MantaRay AI — Škoda Customer Care Agent API", version="3.0.0")
app.include_router(twilio_router)

# CRM WebSocket — broadcasts new_lead events to all connected dashboard clients
_crm_clients: set[WebSocket] = set()
```

### `twilio_handler.py`

FastAPI `APIRouter` with two endpoints:
- `POST /twilio/voice` — Twilio webhook, returns TwiML
- `WS /ws/twilio-stream/{call_sid}` — bidirectional audio relay

Also contains all post-call logic:
- `_fetch_recording_sid()` — polls Twilio for recording SID
- `_analyze_transcript()` — sends transcript to xAI Grok-3
- `_post_call_analysis()` — background task coordinator
- `_hangup_twilio_call()` — Twilio REST API hangup
- `_build_first_message()` — language-aware greeting
- `_is_goodbye()` — goodbye phrase detection
- `register_call()` — stores CallSid→lead_id mapping

### `data/sample_leads.py`

In-memory data store. Module-level state:
- `_leads_db: list[dict]` — 8 pre-seeded Škoda leads (3 primary demo + 5 background)
- `_call_logs: list[dict]` — runtime call log entries

Key functions:
- `get_all_leads()` / `get_lead(id)` — read
- `create_lead(data)` — creates with UUID-based lead_id
- `find_duplicate_lead(phone, email)` — phone (primary) or email (secondary) match
- `merge_lead(lead_id, new_data)` — merges re-enquiry into existing lead
- `update_lead(lead_id, patch)` — merges patch; `preferences` nested-merged
- `delete_lead(lead_id)` — removes from list
- `add_call_log(entry)` / `update_call_log(call_id, patch)` — call log management
- `get_call_logs()` — merges runtime logs + pre-seeded lead call histories
- `get_analytics()` — computes KPIs from live data
- `get_campaigns()` — aggregates leads by campaign name

---

## API Endpoints

### REST

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info + version |
| `GET` | `/health` | Health check — returns `{"status": "healthy", "timestamp": "..."}` |
| `GET` | `/api/leads` | List all leads — `{"leads": [...], "total": N}` |
| `POST` | `/api/leads` | Create/merge lead, broadcast if new, auto-dial if consent |
| `GET` | `/api/leads/{id}` | Single lead — 404 if not found |
| `PATCH` | `/api/leads/{id}` | Update lead fields (see LeadUpdate model below) |
| `DELETE` | `/api/leads/{id}` | Remove lead — 404 if not found |
| `POST` | `/api/leads/{id}/call` | Manually trigger Twilio outbound call |
| `GET` | `/api/calls/logs` | Call history — merged runtime + pre-seeded |
| `GET` | `/api/analytics` | Pipeline stats (KPIs, conversion rate, revenue) |
| `GET` | `/api/campaigns` | Campaign data (leads per campaign, hot count) |
| `GET` | `/api/recordings/{recording_sid}` | Proxy Twilio recording MP3 (handles Basic Auth) |
| `POST` | `/api/billing/create-order` | Razorpay order creation |
| `POST` | `/api/billing/verify` | Razorpay HMAC signature verification |

### Twilio

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/twilio/voice` | Twilio webhook — returns TwiML with `<Connect><Stream>` |
| `WebSocket` | `/ws/twilio-stream/{call_sid}` | Twilio ↔ ElevenLabs audio relay |

### WebSocket

| Endpoint | Description |
|---|---|
| `/ws/crm` | CRM dashboard — broadcasts `new_lead` events to all connected clients |

---

## Pydantic Models

### LeadCreate

```python
class LeadCreate(BaseModel):
    name:                   str
    phone:                  str
    email:                  str
    company_name:           str  = ""
    source:                 str  = "Website"
    preferred_language:     str  = ""
    contact_consent:        bool = True
    communication_consent:  bool = False
    preferences:            dict = {}
```

### LeadUpdate (all fields optional)

```python
class LeadUpdate(BaseModel):
    tag:            Optional[str]   # Hot / Warm / Cold
    status:         Optional[str]   # New / Contacted / Qualified / Closed / Lost
    engagement:     Optional[str]
    engagability:   Optional[str]   # Very High / High / Medium / Low
    notes:          Optional[str]
    address:        Optional[str]
    next_action:    Optional[str]
    follow_up_date: Optional[str]
    preferences:    Optional[dict]  # vehicle_model, variant, budget, etc. — nested merge
```

---

## Call Flow (`twilio_handler.py`)

```
1. POST /twilio/voice  (Twilio fires when customer answers)
   └─► Returns TwiML: <Connect><Stream url="wss://{host}/ws/twilio-stream/{call_sid}"/>

2. /ws/twilio-stream/{call_sid}  opens
   ├── Reads lead data from _sid_to_lead[call_sid]
   ├── Reads "start" event → captures stream_sid (avoids race condition)
   ├── Connects to ElevenLabs wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...
   ├── Receives conversation_initiation_metadata → reads output_fmt
   ├── Sends override: Tara voice + language-specific first_message
   └── Runs asyncio.gather(twilio_to_elevenlabs, elevenlabs_to_twilio)

3. Audio transcoding
   Inbound:  µ-law 8kHz → PCM 16kHz (upsample ×1.5 gain, buffered 3 pkts) → EL
   Outbound: PCM 16kHz → µ-law 8kHz (downsample) → Twilio

4. Goodbye detection
   → _is_goodbye(agent_text, language) → True
   → count 6 more audio chunks → _hangup_twilio_call(call_sid)

5. finally block (always runs)
   ├── Calculate duration from time.time() delta
   ├── add_call_log(log_entry)
   ├── add_call_to_lead(lead_id, record)
   └── asyncio.ensure_future(_post_call_analysis(...))

6. _post_call_analysis (background, concurrent)
   ├── _fetch_recording_sid → polls Twilio, 5 attempts, 20s+15s intervals
   └── _analyze_transcript → xAI Grok-3 → structured JSON
       → update_call_log, update_lead with AI-derived metrics
```

### First Message (Language-Aware)

| Language | First Message |
|---|---|
| English | `"Hello {name}, this is Maya calling from Skoda Auto India."` |
| Hindi | `"Namaste {name} ji, main Maya bol rahi hoon Skoda Auto India se."` |

Language is read from `lead["preferred_language"]` at call time.

---

## CRM WebSocket (`/ws/crm`)

### Message Types

```json
// Server → Client — new lead created (not on duplicate merge)
{
  "type": "new_lead",
  "lead": { ...full lead object... },
  "message": "New enquiry from Priya!",
  "timestamp": "2026-05-06T10:23:01.123456"
}

// Client → Server — keep-alive
{ "type": "ping" }

// Server → Client — keep-alive response
{ "type": "pong" }
```

Dead connections (disconnected clients) are detected on send failure and removed from `_crm_clients`.

---

## Recording Proxy

```
GET /api/recordings/{recording_sid}
```

Fetches `https://api.twilio.com/2010-04-01/Accounts/{SID}/Recordings/{REC}.mp3` with Twilio Basic Auth — credentials never sent to the browser. Returns `audio/mpeg` with `Content-Disposition: inline` so the browser can play the recording directly.

---

## Analytics Response

```json
{
  "total_leads":      8,
  "hot_leads":        3,
  "warm_leads":       4,
  "cold_leads":       0,
  "contacted":        1,
  "qualified":        1,
  "calls_today":      2,
  "total_calls":      5,
  "conversion_rate":  12.5,
  "monthly_revenue":  "₹14,20,000",
  "pipeline_value":   "₹9,80,00,000"
}
```

---

## Duplicate Lead Detection

```python
def find_duplicate_lead(phone: str, email: str) -> dict | None:
    phone_clean = phone.replace(" ", "").replace("-", "").strip()
    email_clean = email.strip().lower()
    for lead in _leads_db:
        # Phone match (primary — more reliable)
        if phone_clean and lead["phone"].replace(" ","").replace("-","") == phone_clean:
            return lead
        # Email match (secondary fallback)
        if email_clean and lead.get("email","").strip().lower() == email_clean:
            return lead
    return None
```

On duplicate: `merge_lead()` is called. The merge increments `enquiry_count`, appends a `RE-ENQUIRY` record to `call_history`, merges preferences (new values override empty old values), updates `status` to `"Re-enquiry"`, and bumps `Cold` → `Warm`. No dashboard broadcast is sent for re-enquiries.

---

## Pre-Seeded Demo Leads

Three primary leads cover the three language modes used in demos:

| Lead | Language | Model | City | Tag |
|---|---|---|---|---|
| Priya Sharma | English | Škoda Kushaq Style | Bangalore | Hot |
| Pooja Malhotra | Hindi | Škoda Slavia Monte Carlo | Mumbai | Warm |
| Dia Mehta | Hinglish | Škoda Kodiaq Sportline | Hyderabad | Hot |

Five background leads fill out analytics and the CRM table.

---

## Logging

Runtime logs written to `backend/twilio_relay.log` (UTF-8, appends across restarts):

```
2026-05-06 10:23:01 [Webhook] POST /twilio/voice — CallSid=CA... Status=in-progress
2026-05-06 10:23:02 [WS] Accepted — call_sid=CA...
2026-05-06 10:23:03 [EL] Connected
2026-05-06 10:23:03 [EL] output_fmt=pcm_16000  conv_id=conv_...
2026-05-06 10:23:03 [EL] Sent override — customer=Priya lang=english voice=rfh7...
2026-05-06 10:23:05 [EL] MAYA said: 'Hello Priya...'
2026-05-06 10:23:08 [EL] CUSTOMER said: 'Hi yes...'
2026-05-06 10:23:45 [EL] Goodbye phrase detected — will hang up after audio
2026-05-06 10:23:46 [Hangup] Call CA... ended via Twilio REST API
2026-05-06 10:23:46 [WS] Call log saved — lead=lead_001 duration=2:14 turns=12
```

---

## Health Check

```bash
curl http://localhost:8000/health
# {"status": "healthy", "timestamp": "2026-05-06T10:23:01.123456"}
```

---

## Known Limitations

- **Single process, in-memory only** — data resets on restart; `--workers 1` required (WebSocket state is process-local)
- **No auth on API endpoints** — all REST endpoints accessible without credentials (relies on frontend auth gate)
- **CORS permissive** — `allow_origins=["*"]` — restrict to your domain in production
- **Twilio requires public HTTPS** — `PUBLIC_BASE_URL` must be reachable; ngrok URL expires on free plan
- **Recording SID available after 30–90s** — post-call analysis background task polls with retries
