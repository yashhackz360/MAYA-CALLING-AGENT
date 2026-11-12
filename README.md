# MAYA Calling Agent —  India

AI-powered voice sales agent that conducts professional customer care calls for Škoda Auto India. **Maya** — the AI voice — dials customers via Twilio, speaks through ElevenLabs (Tara voice), drives a natural discovery conversation to qualify vehicle enquiries over a real PSTN phone call, and now speaks with **city-specific dealership and inventory awareness** via the Dealership Intelligence Layer.

**Stack: Twilio (outbound PSTN) + ElevenLabs Conversational Agent (voice AI) + xAI Grok (post-call analysis) + FastAPI (backend) + React 18 (dashboard)**

---

## Live Demo & Sample Call Recording

| Resource | Link / Access |
|---|---|
| **Live CRM Dashboard** | [https://maya-calling-agent.vercel.app](https://maya-calling-agent.vercel.app) *(Demo Login: `admin` / `admin123`)* |
| **Customer Enquiry Form** | [https://maya-calling-agent.vercel.app/enquiry](https://maya-calling-agent.vercel.app/enquiry) |
| **Sample AI Call Recording (MP3)** | [Listen to / Download Maya Live Call Recording](https://maya-calling-agent.vercel.app/demo/maya-demo-call.mp3) · ([GitHub Raw MP3](./frontend/public/demo/maya-demo-call.mp3)) |
| **Backend API & Docs** | [https://mantaray-backend.onrender.com/docs](https://mantaray-backend.onrender.com/docs) |

> **Note:** Click the sample call recording above to hear a real outbound PSTN call conducted by **Maya** (ElevenLabs Tara voice over Twilio Media Streams) qualifying a Škoda Auto India customer enquiry in real time.

---

## Quick Start — Git Clone & Run

```bash
# 1. Clone the repository
git clone https://github.com/yashhackz360/MAYA-CALLING-AGENT.git
cd MAYA-CALLING-AGENT

# 2. Copy and fill environment variables
cp .env.example .env
# Edit .env with your Twilio, ElevenLabs, and (optionally) xAI keys

# 3a. Run with Docker (recommended)
docker compose up --build

# 3b. Or run locally without Docker
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install && npm run dev
# Opens at http://localhost:5173
```

**Twilio requires a public HTTPS URL.** Run ngrok before starting:
```bash
ngrok http 8000
# Copy the https://... URL → set as PUBLIC_BASE_URL in .env
```

**Windows convenience scripts:**
```
start.bat              # launches backend + frontend together
start_backend.bat      # backend only
start_frontend.bat     # frontend only
```

---

## Architecture

```
New Lead Submitted (EnquiryPage / Dashboard)
        │
        ▼
POST /api/leads  ──►  FastAPI (main.py)
        │               │
        │               ├─► broadcast /ws/crm  ──►  Dashboard LeadToast notification
        │               │                      ──►  LeadGeneration live feed
        │               │
        └─► Twilio REST API  ──►  Outbound call to customer's phone
                │
                ▼
        Customer answers
                │
                ▼
        Twilio Media Stream (WebSocket)
                │
                ▼
        FastAPI /ws/twilio-stream/{call_sid}  (twilio_handler.py)
                │  bidirectional µ-law ↔ PCM audio relay
                │  _build_dynamic_variables() ← injects Dealership Intelligence
                ▼
        ElevenLabs Conversational Agent WebSocket
        ├─ STT:   ElevenLabs built-in
        ├─ LLM:   ElevenLabs Agent (configured in EL dashboard)
        └─ TTS:   ElevenLabs Tara voice (rfh7WrTVqLIjVSioJwdI)
                │
                ▼
        Goodbye phrase detected  ──►  Twilio REST API hangup
                │
                ▼
        Call log saved (in-memory)
                │
                ▼
        Background: xAI Grok transcript analysis + Twilio recording SID poll
```

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13 · FastAPI 0.115 · Uvicorn |
| Outbound Calling | Twilio REST API (outbound PSTN) |
| AI Conversation | ElevenLabs Conversational Agent (`ELEVENLABS_AGENT_ID`) |
| Voice (TTS + STT) | ElevenLabs Tara voice — built into the EL agent |
| Post-Call Analysis | xAI Grok-3 — transcript classification and lead scoring |
| Audio Transcoding | µ-law 8kHz ↔ PCM 16kHz via `audioop` / `audioop-lts` |
| Dealership Intel | `backend/data/dealerships.py` — 10 cities, 5 models, inventory & offers |
| Frontend | React 18 · Vite · Vanilla CSS |
| Routing | React Router v6 (full-page navigation) |
| Realtime | WebSocket `/ws/crm` — CRM lead notifications |
| Payments | Razorpay |
| Container | Docker Compose (backend: python:3.13-slim, frontend: nginx:alpine) |

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio auth token |
| `TWILIO_FROM_NUMBER` | ✅ | Twilio phone number in E.164 format |
| `PUBLIC_BASE_URL` | ✅ | Public HTTPS URL for Twilio webhooks (ngrok URL) |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | ✅ | ElevenLabs Conversational Agent ID |
| `XAI_API_KEY` | Optional | xAI Grok post-call transcript analysis |
| `RAZORPAY_KEY_ID` | Optional | Razorpay payment gateway |
| `RAZORPAY_KEY_SECRET` | Optional | Razorpay payment gateway |

---

## How a Call Works

```
1. Lead submits enquiry (/enquiry form) or is added manually on the dashboard
2. POST /api/leads creates lead + broadcasts toast notification to dashboard
3. Twilio auto-dials customer's phone (if TWILIO_SID set + contact_consent=true)
4. Customer answers → Twilio fires POST /twilio/voice webhook
5. FastAPI returns TwiML: <Connect><Stream url="wss://.../ws/twilio-stream/{call_sid}"/>
6. Twilio opens audio WebSocket → FastAPI relays to ElevenLabs Agent WebSocket
7. _build_dynamic_variables() injects 14 context vars including 5 Dealership Intelligence vars
8. ElevenLabs override: Tara voice + "Hello {name}, this is Maya calling from Škoda..."
9. Bidirectional audio relay:
     Twilio µ-law 8kHz → upsample → PCM 16kHz → ElevenLabs (user_audio_chunk)
     ElevenLabs PCM 16kHz → downsample → µ-law 8kHz → Twilio media event
10. Maya detects goodbye phrase → waits 6 audio chunks → hangs up via Twilio REST
11. Call log saved to in-memory store
12. Background tasks: poll Twilio for recording SID + xAI Grok transcript analysis
13. Lead automatically updated with AI-derived tag, engagability, next_action
```

---

## Dealership Intelligence Layer

Maya is now contextually aware of local showrooms and live inventory. When a call is initiated, `_build_dynamic_variables()` fetches from `backend/data/dealerships.py` and injects 5 extra dynamic variables:

| Variable | Example Content |
|---|---|
| `{{dealer_info}}` | "We have 3 Škoda showrooms in Bangalore. Top-rated: Škoda Whitefield — 4.8★. Call: 080-4567-8901." |
| `{{inventory_status}}` | "Škoda Kushaq Style 1.5 TSI AT: 2 units left — book quickly. Price: ₹17.49L. Colours: White, Red, Silver." |
| `{{current_offers}}` | "Exchange bonus ₹50,000 | Loyalty benefit ₹25,000 | Corporate discount ₹20,000" |
| `{{appointment_prompt}}` | "I can book you a test drive at Škoda Whitefield in Whitefield. Typical wait: 7 days." |
| `{{city_served}}` | "Bangalore" |

These variables map directly to `{{placeholders}}` in the ElevenLabs system prompt, making Maya sound locally informed on every call.

---

## Authentication

Dashboard protected by session-based auth gate (`sessionStorage`). Demo credentials:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `demo` | `demo123` | Viewer |
| `manager` | `manager123` | Manager |

The `/enquiry` route is **public** — no login required.

---

## Pages & Routes

| Route | Component | Auth | Description |
|---|---|---|---|
| `/` | `Dashboard.jsx` | ✅ | KPI cards, pipeline, recent leads, LeadToast notifications |
| `/leads` | `Leads.jsx` | ✅ | Lead list with search, tag filters, call triggers |
| `/leads/:id` | `LeadDetail.jsx` | ✅ | Full lead profile + Dealership Intelligence sections |
| `/leads/:id/edit` | `LeadEdit.jsx` | ✅ | Edit CRM fields, vehicle prefs, notes |
| `/lead-generation` | `LeadGeneration.jsx` | ✅ | Real-time WebSocket enquiry feed |
| `/campaigns` | `Campaigns.jsx` | ✅ | Campaign performance tracking |
| `/analytics` | `Analytics.jsx` | ✅ | Deep-dive pipeline metrics |
| `/call-logs` | `CallLogs.jsx` | ✅ | Twilio call history (filterable by lead via `?lead=<id>`) |
| `/call-logs/:call_id/edit` | `CallLogEdit.jsx` | ✅ | Edit call status, outcome notes, escalation flag |
| `/billing` | `Billing.jsx` | ✅ | Invoices, cost estimator, Razorpay payment |
| `/enquiry` | `EnquiryPage.jsx` | ❌ Public | Customer-facing enquiry form with live dealer preview |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/leads` | GET | List all leads |
| `/api/leads` | POST | Create lead + broadcast to dashboard + auto-dial |
| `/api/leads/{id}` | GET | Single lead details |
| `/api/leads/{id}` | PATCH | Update lead fields |
| `/api/leads/{id}` | DELETE | Remove lead |
| `/api/leads/{id}/call` | POST | Manually trigger Twilio outbound call |
| `/api/calls/logs` | GET | Call history |
| `/api/analytics` | GET | Pipeline stats |
| `/api/campaigns` | GET | Campaign data |
| `/api/recordings/{recording_sid}` | GET | Proxy Twilio recording MP3 |
| `/api/billing/create-order` | POST | Create Razorpay order |
| `/api/billing/verify` | POST | Verify Razorpay signature |
| `/api/dealerships` | GET | All dealerships, optionally filtered by `?city=` |
| `/api/dealerships/cities` | GET | List of supported cities |
| `/api/inventory` | GET | Inventory for all or a specific `?model=` |
| `/api/dealer-intelligence` | GET | AI-ready context strings for `?city=&model=` |
| `/twilio/voice` | POST | Twilio webhook — returns TwiML stream config |
| `/ws/twilio-stream/{call_sid}` | WebSocket | Twilio ↔ ElevenLabs audio relay |
| `/ws/crm` | WebSocket | Dashboard lead notification broadcast |
| `/health` | GET | Health check |

---

## Documentation

- [`TECHNICAL_WALKTHROUGH.md`](./TECHNICAL_WALKTHROUGH.md) — Full architecture, audio pipeline, relay flow, Dealership Intelligence integration
- [`VOICE_AGENT_DEEP_DIVE.md`](./VOICE_AGENT_DEEP_DIVE.md) — Maya voice agent internals, dynamic variables, goodbye detection, post-call analysis
- [`backend/README.md`](./backend/README.md) — FastAPI backend, Twilio integration, env setup, API reference
- [`frontend/README.md`](./frontend/README.md) — React frontend, pages, design system, components
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Docker, ngrok, local dev, and production deployment

---

## Project Structure

```
MAYA-CALLING-AGENT/
├── backend/
│   ├── main.py              # FastAPI app — all REST + CRM WebSocket + Dealership Intelligence API
│   ├── twilio_handler.py    # Twilio webhook + audio relay + goodbye detection + DI injection
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── data/
│       ├── sample_leads.py  # In-memory lead store (CRUD, call logs, analytics)
│       └── dealerships.py   # [NEW] Dealership Intelligence Layer — city data, inventory, context builders
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router, sidebar, topbar, auth gate
│   │   ├── index.css        # Global design system + di-* Dealership Intelligence CSS classes
│   │   └── pages/
│   │       ├── EnquiryPage.jsx   # Customer form + live dealer/inventory preview
│   │       ├── LeadDetail.jsx    # Lead profile + Dealership Intelligence sections
│   │       └── ...              # All other page components
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── start.bat
```
