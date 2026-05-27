# MantaRay AI — Technical Walkthrough (v7)

Complete architecture guide covering every code path from lead creation through voice call to post-call analysis.

---

## System Architecture

```
Browser (React 18 + Vite)
  ├── App.jsx
  │     ├── BrowserRouter + Routes
  │     ├── sessionStorage auth gate (LoginPage / AppLayout)
  │     └── Sidebar (dark navy #0c1322) + TopBar
  │
  ├── Dashboard.jsx
  │     ├── LeadToast (fixed top-right, WebSocket-driven via /ws/crm)
  │     └── KPI cards, pipeline funnel, recent leads table, call trigger
  │
  ├── Leads.jsx
  │     └── Lead table with search/tag filter → navigates to /leads/:id
  │
  ├── LeadDetail.jsx   (/leads/:id)
  │     ├── Full-page lead profile (contact, vehicle prefs, CRM fields, call history)
  │     ├── "Call Now with Maya" → POST /api/leads/:id/call
  │     ├── "Update" → navigates /leads/:id/edit
  │     └── "Call Logs" → navigates /call-logs?lead=:id
  │
  ├── LeadEdit.jsx   (/leads/:id/edit)
  │     └── Edit form (tag, status, engagability, vehicle prefs, notes)
  │           → PATCH /api/leads/:id → navigate back to /leads/:id
  │
  ├── CallLogs.jsx   (/call-logs)
  │     ├── URL param ?lead=<id> pre-filters by lead
  │     └── Edit row → navigate /call-logs/:call_id/edit
  │
  ├── CallLogEdit.jsx   (/call-logs/:call_id/edit)
  │     └── Edit call status, outcome notes, escalation flag (front-end state only)
  │
  ├── LeadGeneration.jsx
  │     └── Live enquiry feed via /ws/crm WebSocket
  │
  ├── Billing.jsx
  │     └── Invoices table, cost estimator, Razorpay payment integration
  │
  └── EnquiryPage.jsx  (public, no auth)
        └── POST /api/leads

FastAPI Backend (main.py)
  ├── /api/leads           → CRUD, duplicate merge, CRM broadcast, Twilio auto-dial
  ├── /api/leads/{id}/call → manual Twilio outbound call trigger
  ├── /api/calls/logs      → call history (runtime + pre-seeded)
  ├── /api/analytics       → pipeline stats
  ├── /api/campaigns       → campaign data
  ├── /api/recordings/{sid}→ proxy Twilio recording MP3 (Basic Auth handled server-side)
  ├── /api/billing/*       → Razorpay order + HMAC signature verify
  ├── /ws/crm              → CRM broadcast (new_lead events)
  │
  └── twilio_handler.py (APIRouter)
        ├── POST /twilio/voice           → TwiML webhook
        └── WS /ws/twilio-stream/{sid}  → Twilio ↔ ElevenLabs audio relay

External Services
  ├── Twilio   — outbound PSTN calls, recording storage
  ├── ElevenLabs Conversational Agent
  │     ├── STT: built-in
  │     ├── LLM: configured in EL dashboard
  │     └── TTS: Tara voice (rfh7WrTVqLIjVSioJwdI)
  └── xAI Grok-3 — post-call transcript analysis (background, optional)
```

---

## Key Files

| File | Responsibility |
|---|---|
| `backend/main.py` | FastAPI — all REST routes, CRM WebSocket, Razorpay billing, health |
| `backend/twilio_handler.py` | Twilio webhook, bidirectional audio relay, goodbye detection, call logging, post-call analysis |
| `backend/data/sample_leads.py` | In-memory lead store — CRUD, call log store, analytics, campaigns, duplicate detection |
| `frontend/src/App.jsx` | Sidebar navigation, BrowserRouter, auth gate, TopBar |
| `frontend/src/pages/Dashboard.jsx` | KPI cards, pipeline, `LeadToast` notification component, recent leads |
| `frontend/src/pages/Leads.jsx` | Lead list with search, tag filters, inline call trigger |
| `frontend/src/pages/LeadDetail.jsx` | Full-page lead profile — read-only view, call trigger, navigation |
| `frontend/src/pages/LeadEdit.jsx` | Full-page lead edit form — PATCH API, redirects to detail |
| `frontend/src/pages/CallLogs.jsx` | Call history table — URL `?lead=` filter, edit row navigation |
| `frontend/src/pages/CallLogEdit.jsx` | Call log edit form — status, outcome, escalation (in-memory) |
| `frontend/src/pages/LeadGeneration.jsx` | Live enquiry feed via `/ws/crm` |
| `frontend/src/pages/EnquiryPage.jsx` | Public customer enquiry form |
| `frontend/src/pages/Billing.jsx` | Invoices, Razorpay payment flow, cost estimator |
| `frontend/src/pages/LoginPage.jsx` | Auth gate — demo credentials, sessionStorage |
| `frontend/src/index.css` | Global design system — CSS custom properties, component classes, animations |

---

## Audio Relay Pipeline (`twilio_handler.py`)

### Twilio → ElevenLabs (Customer's voice inbound)

```
Twilio MediaStream event (WebSocket)
  → base64-encoded µ-law payload at 8kHz, ~20ms per packet
  → base64.b64decode()
  → audioop.ulaw2lin(mulaw, 2)         → 16-bit PCM at 8kHz
  → audioop.ratecv(pcm8k, 2, 1, 8000, 16000, state)  → 16-bit PCM at 16kHz (upsample)
  → audioop.mul(pcm16k, 2, 1.5)        → volume gain ×1.5 (clearer signal for STT)
  → buffer 3 packets (≈60ms) to reduce WS overhead and avoid too-small STT chunks
  → JSON: { "user_audio_chunk": "<base64 PCM 16kHz>" }
  → ElevenLabs Conversational Agent WebSocket
```

### ElevenLabs → Twilio (Maya's voice outbound)

```
ElevenLabs audio event (type="audio")
  → audio_event.audio_base_64 OR audio.chunk (handles both EL API versions)
  → base64.b64decode() → raw audio bytes

  Format handling (output_fmt read from conversation_initiation_metadata):
    "ulaw_8000"  → use raw bytes directly (already µ-law at 8kHz)
    "pcm_8000"   → audioop.lin2ulaw(raw, 2) → µ-law
    "pcm_16000"  → audioop.ratecv(raw, 2, 1, 16000, 8000, state)  (downsample)
                   → audioop.lin2ulaw(pcm8k, 2) → µ-law

  → base64.b64encode(mulaw)
  → JSON: { "event": "media", "streamSid": stream_sid, "media": { "payload": "..." } }
  → Twilio MediaStream → customer hears Maya's voice on their phone
```

### Buffering Strategy

The `twilio_to_elevenlabs` coroutine buffers **3 packets (≈60ms)** before sending to ElevenLabs. This:
- Reduces WebSocket message overhead
- Prevents ElevenLabs STT from receiving too-small audio frames
- Keeps latency within acceptable bounds (< 100ms delay added)

---

## Call Lifecycle — Step by Step

```
1. POST /twilio/voice  (Twilio fires when outbound call is answered)
   └─► Returns TwiML:
       <Response>
         <Connect>
           <Stream url="wss://{PUBLIC_BASE_URL}/ws/twilio-stream/{CallSid}"/>
         </Connect>
       </Response>

2. /ws/twilio-stream/{call_sid}  opens
   ├── await websocket.accept()
   └── Wait for Twilio "start" event (8s timeout)
         "connected" event ignored
         "start"     event → captures stream_sid (critical — all audio needs this)

3. Connect to ElevenLabs
   └── wss://api.elevenlabs.io/v1/convai/conversation?agent_id={ELEVENLABS_AGENT_ID}
         headers: { "xi-api-key": ELEVENLABS_API_KEY }
         ping_interval=None, open_timeout=15s

4. Receive conversation_initiation_metadata (10s timeout)
   └── reads agent_output_audio_format (pcm_16000 / ulaw_8000 / pcm_8000)
       reads conversation_id

5. Send per-call config override
   └── type: "conversation_initiation_client_data"
       conversation_config_override:
         agent.first_message: "Hello {name}, this is Maya calling from Skoda..."
         tts.voice_id: "rfh7WrTVqLIjVSioJwdI"  (Tara)

6. asyncio.gather() runs both coroutines concurrently:
   ├── twilio_to_elevenlabs()  — inbound customer audio
   └── elevenlabs_to_twilio()  — outbound Maya audio + event handling

7. Goodbye detection (in elevenlabs_to_twilio)
   └── agent_response event received
       → _is_goodbye(text, preferred_language) → True
       → goodbye_detected = True
       → next 6 audio events: goodbye_audio_chunks increments
       → at chunk 6: asyncio.ensure_future(_hangup_twilio_call(call_sid))

8. Twilio hangup
   └── client.calls(call_sid).update(status="completed")  via Twilio REST API

9. finally block always runs (regardless of how call ended)
   ├── Calculate duration from time.time() delta
   ├── add_call_log(log_entry) → saves to _call_logs list
   ├── add_call_to_lead(lead_id, ...) → appends to lead.call_history
   └── asyncio.ensure_future(_post_call_analysis(...)) → background task
```

---

## Lead Creation & Duplicate Detection

```python
POST /api/leads

  1. find_duplicate_lead(phone, email)
     → normalizes phone (strips spaces/dashes), lowercases email
     → searches _leads_db for exact match on phone (primary) or email (secondary)

  2a. If duplicate found:
       merge_lead(existing_id, new_data)
         → increment enquiry_count
         → append RE-ENQUIRY record to call_history
         → merge preferences (new values win)
         → upgrade status to "Re-enquiry", tag Cold→Warm
       is_repeat = True  (no dashboard broadcast, no notification)

  2b. If new lead:
       create_lead(data)  → new UUID-based lead_id, status="New", tag="Warm"
       broadcast_new_lead(lead)  → all /ws/crm subscribers notified
       is_repeat = False

  3. Auto-dial (if TWILIO_SID set + lead.contact_consent=True):
       client.calls.create(to=phone, from_=TWILIO_NUMBER, url=.../twilio/voice, record=True)
       register_call(call.sid, lead_id)  → stores CallSid→lead_id in _sid_to_lead dict
```

---

## Post-Call Analysis (Background Task)

Runs as `asyncio.ensure_future()` after call ends. Two tasks run concurrently:

### _fetch_recording_sid (polls Twilio)

```
for attempt in range(5):
    sleep 20s (first attempt) or 15s (subsequent)
    client.calls(call_sid).recordings.list()
    → if recordings found: return recordings[0].sid
→ updates call log entry with recording_sid
```

Twilio takes 30–90 seconds to process recordings after a call ends.

### _analyze_transcript (xAI Grok-3)

Requires `XAI_API_KEY` in `.env`. Sends full transcript to `https://api.x.ai/v1/chat/completions`:

```json
{
  "model": "grok-3",
  "temperature": 0.1,
  "messages": [{
    "role": "user",
    "content": "Analyze this Škoda sales call transcript. Return JSON only:\n{turns}"
  }]
}
```

Expected response structure:
```json
{
  "engagability":    "Very High | High | Medium | Low",
  "category":        "Hot | Warm | Cold",
  "worth_pursuing":  true | false,
  "purchase_intent": "High | Medium | Low | None",
  "conclusion":      "1-2 sentence outcome summary",
  "key_insights":    ["insight 1", "insight 2", "insight 3"],
  "next_action":     "specific recommended next step"
}
```

### Lead Auto-Update After Analysis

| AI Field | Lead Field |
|---|---|
| `category` | `tag` (Hot / Warm / Cold) |
| `engagability` | `engagability` |
| `next_action` | `next_action` |
| `purchase_intent` | `intent` |
| full `ai_analysis` dict | `ai_analysis` (raw) |

---

## Real-Time CRM Notification System

### WebSocket Flow (`/ws/crm`)

```
EnquiryPage (browser) submits form
  → POST /api/leads  (new lead only — duplicates don't broadcast)

backend main.py:
  → broadcast_new_lead(lead)
  → iterates _crm_clients set
  → sends JSON to each connected WebSocket:
      {
        "type": "new_lead",
        "lead": { ...full lead object... },
        "message": "New enquiry from Priya!",
        "timestamp": "2026-05-06T..."
      }
  → dead connections removed from set

Dashboard.jsx:
  → WebSocket onmessage → type==="new_lead" → addNotif(lead)
  → LeadToast renders (fixed top-right, z-index: 9999, 9s auto-dismiss)

LeadGeneration.jsx:
  → WebSocket onmessage → prepends lead to live feed table
  → Updates Today / Total / Hot stat counters
```

### Keep-Alive Protocol

```
Client → Server:  { "type": "ping" }
Server → Client:  { "type": "pong" }
```

### LeadToast Component (Dashboard.jsx)

```
Structure:
  1. Tri-color accent bar — indigo → sky → emerald gradient (top border)
  2. Header — "New Enquiry Received" + dismiss × button
  3. Lead card — initials avatar, name, phone/vehicle/location chips, tag badge
  4. Maya AI strip — animated waveform bars + "Maya AI — Automated Call in Progress"
  5. Action buttons — "View Lead" (→ /leads) · "Call Logs" (→ /call-logs)
  6. Progress bar — depletes over 9s, triggers auto-dismiss at 0

CSS Animations:
  toastSlideIn  — spring slide-in from right (cubic-bezier 0.34,1.56,0.64,1)
  bellPulse     — radial glow on phone icon (2 pulses on mount)
  waveBar       — staggered oscillation on 5 bars (infinite, 0.9s cycle, delays 0–0.4s)
```

---

## ElevenLabs Agent Configuration

The ElevenLabs Conversational Agent is configured in the ElevenLabs dashboard. The backend overrides per-call settings at connection time.

| Setting | Value |
|---|---|
| Voice | Tara — `rfh7WrTVqLIjVSioJwdI` |
| First message | Overridden per-call via `conversation_initiation_client_data` |
| Language | English / Hindi — set per-call from `lead.preferred_language` |
| System prompt | Škoda Maya persona — configured in EL dashboard |

Per-call override payload:
```json
{
  "type": "conversation_initiation_client_data",
  "conversation_config_override": {
    "agent": {
      "first_message": "Hello Priya, this is Maya calling from Skoda Auto India. Am I speaking with Priya?"
    },
    "tts": {
      "voice_id": "rfh7WrTVqLIjVSioJwdI"
    }
  }
}
```

### Language-Aware Greeting

| Language | First Message |
|---|---|
| English | `"Hello {name}, this is Maya calling from Skoda Auto India."` |
| Hindi | `"Namaste {name} ji, main Maya bol rahi hoon Skoda Auto India se."` |

### ElevenLabs Events Handled

| Event type | Action |
|---|---|
| `audio` | Transcode PCM→µ-law, forward to Twilio; count goodbye audio chunks |
| `agent_response` | Log to transcript, check for goodbye phrase |
| `user_transcript` | Log to transcript (customer's words) |
| `interruption` | Send `{ "event": "clear", "streamSid": ... }` to Twilio (barge-in support) |
| `ping` | Reply `{ "type": "pong", "event_id": ... }` — keep-alive |
| `conversation_initiation_metadata` | Handled before relay loop starts |

---

## Frontend Pages & Routes

| Route | Component | Auth | Description |
|---|---|---|---|
| `/` | `Dashboard.jsx` | ✅ Required | KPI cards, pipeline, LeadToast, recent leads |
| `/leads` | `Leads.jsx` | ✅ Required | Lead list, search/filter, inline call trigger |
| `/leads/:id` | `LeadDetail.jsx` | ✅ Required | Full lead profile — read-only view |
| `/leads/:id/edit` | `LeadEdit.jsx` | ✅ Required | Edit lead (PATCH API) |
| `/lead-generation` | `LeadGeneration.jsx` | ✅ Required | Live WS enquiry feed |
| `/campaigns` | `Campaigns.jsx` | ✅ Required | Campaign performance |
| `/analytics` | `Analytics.jsx` | ✅ Required | Deep-dive metrics with Recharts |
| `/call-logs` | `CallLogs.jsx` | ✅ Required | Call history + `?lead=` URL filter |
| `/call-logs/:call_id/edit` | `CallLogEdit.jsx` | ✅ Required | Edit call record (front-end state) |
| `/billing` | `Billing.jsx` | ✅ Required | Invoices, Razorpay payment |
| `/enquiry` | `EnquiryPage.jsx` | ❌ Public | Customer enquiry form |

### Navigation Design

All view/edit actions use **full-page routing** — no modal overlays.

```
Leads table row click       → /leads/:id (LeadDetail)
LeadDetail "Update" button  → /leads/:id/edit (LeadEdit)
LeadEdit save               → navigate(-1) to /leads/:id
LeadDetail "Call Logs"      → /call-logs?lead=:id
CallLogs edit icon          → /call-logs/:call_id/edit
Back buttons                → navigate(-1) or explicit parent path
```

### API Helper (`App.jsx`)

```javascript
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}
```

---

## Frontend Design System

- **Theme:** Light/white enterprise — CSS custom properties via `:root`
- **Sidebar:** Dark navy `#0c1322`
- **Typography:** Inter (Google Fonts)
- **Charts:** Recharts library
- **Icons:** Lucide React

### CSS Animation Keyframes

| Keyframe | Used By |
|---|---|
| `toastSlideIn` | `LeadToast` — spring slide-in from right |
| `bellPulse` | `LeadToast` phone icon radial glow |
| `waveBar` | `LeadToast` Maya AI waveform bars (staggered) |
| `fadeInUp` | Page transitions, detail page mounts |
| `float` | Login page background floating shapes |

---

## In-Memory Data Store (`data/sample_leads.py`)

The backend uses a Python list `_leads_db` as the primary data store. Data resets on server restart.

### Lead Object Schema

```python
{
  "lead_id":             "lead_001",          # UUID or sequential
  "name":                "Priya Sharma",
  "phone":               "+91 98765 43210",
  "email":               "priya@infosys.com",
  "source":              "Website",
  "preferred_language":  "english",           # english / hindi / hinglish
  "status":              "New",               # New / Contacted / Qualified / Closed / Lost / Re-enquiry
  "tag":                 "Hot",               # Hot / Warm / Cold
  "created_at":          "2026-05-06T...",
  "preferences": {
    "location":          "Bangalore",
    "vehicle_model":     "Škoda Kushaq",
    "variant":           "Style",
    "budget":            "₹16–18 Lakhs",
    "transmission":      "Automatic",
    "enquiry_type":      "New Purchase",
    "notes":             "..."
  },
  "call_history":        [...],               # list of call records
  "engagement":          "Very High",
  "intent":              "Purchase",
  "urgency":             "High",
  "fit":                 "Excellent",
  "assigned_agent":      "Maya",
  "campaign":            "Kushaq Style Summer Drive 2024",
  "contact_consent":     true,
  "communication_consent": false,
  "ai_analysis":         {...},               # Grok analysis (post-call)
  "enquiry_count":       1,
  "last_enquiry_at":     "2026-05-06T..."
}
```

### Call Log Entry Schema

```python
{
  "call_id":       "CA...",        # Twilio CallSid
  "lead_id":       "lead_001",
  "recipient":     "Priya",
  "lead_name":     "Priya",
  "phone":         "+91 ...",
  "duration":      "2:14",
  "status":        "Completed",
  "outcome":       "Maya AI call completed",
  "date":          "2026-05-06T...",
  "timestamp":     "2026-05-06T...",
  "escalated":     false,
  "transcript":    [{"role": "agent", "text": "..."}, ...],
  "recording_sid": "RE...",        # filled by _fetch_recording_sid
  "ai_analysis":   {...}           # filled by _analyze_transcript
}
```

---

## Billing / Razorpay Integration

### Order Creation

```
POST /api/billing/create-order
  body: { amount: <int INR>, currency: "INR", invoice_id: "INV-001" }
  → razorpay.Client.order.create({ amount: amount*100, ... })
  → returns Razorpay order object (id, amount, currency, status)
```

### Payment Verification (HMAC-SHA256)

```
POST /api/billing/verify
  body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoice_id }
  → expected = HMAC-SHA256(RAZORPAY_KEY_SECRET, f"{order_id}|{payment_id}")
  → hmac.compare_digest(expected, signature)  ← constant-time comparison
  → 400 if invalid, 200 {"success": true} if valid
```

---

## Recording Proxy Endpoint

```
GET /api/recordings/{recording_sid}
  → fetches https://api.twilio.com/2010-04-01/Accounts/{SID}/Recordings/{REC}.mp3
  → Basic Auth with (TWILIO_SID, TWILIO_TOKEN) — credentials never exposed to browser
  → returns audio/mpeg bytes inline
```

---

## Logging (`twilio_relay.log`)

Written to `backend/twilio_relay.log` via Python `logging`. All relay activity:

| Prefix | Meaning |
|---|---|
| `[URL]` | PUBLIC_BASE_URL resolved |
| `[Webhook]` | POST /twilio/voice received |
| `[WS]` | WebSocket accept / relay summary / close |
| `[EL]` | ElevenLabs connection, metadata, override, agent speech |
| `[T->EL]` | Twilio→ElevenLabs packet/chunk counts |
| `[EL->T]` | ElevenLabs→Twilio audio chunks, goodbye detection |
| `[Hangup]` | Twilio REST hangup attempt + result |
| `[PostCall]` | Background analysis start / recording fetch / lead update |
| `[Recording]` | Twilio recording SID poll attempts |
| `[Analysis]` | Grok-3 transcript analysis result or error |

---

## Known Limitations

- **In-memory store** — all data resets on backend restart (no database)
- **Single worker** — Docker CMD uses `--workers 1`; WebSocket relay state and in-memory leads are process-local
- **No persistent call log edits** — `CallLogEdit.jsx` edits are front-end state only (no PATCH endpoint for call logs)
- **Demo auth only** — sessionStorage, three hardcoded credentials; no RBAC or token expiry
- **CORS permissive** — `allow_origins=["*"]` included; restrict for production
- **No call recording in-app** — Twilio stores recordings; app saves only the recording SID
- **No multi-tenancy** — single shared in-memory store

---

## Eliminated in v6 (Path B Removal)

The following files/endpoints were removed. They were part of the browser call simulation path (xAI Grok streaming voice via browser microphone):

| Removed | Was Used For |
|---|---|
| `backend/agent/conversation.py` | 5-state call state machine for browser simulation |
| `backend/agent/llm_client.py` | xAI Grok-3-fast streaming LLM + Deepgram STT + EL TTS calls |
| `backend/call_manager/manager.py` | In-memory browser call session registry |
| `frontend/src/pages/CallConsole.jsx` | Browser-based call UI with MediaRecorder + Web Speech API |
| `POST /api/calls/initiate` | Browser call session start |
| `POST /api/calls/turn` | Browser call turn |
| `POST /api/calls/{id}/end` | Browser call end |
| `GET /api/calls/active` | Active browser sessions |
| `POST /api/stt` | Deepgram / xAI server-side transcription |
| `POST /api/voice/tts` | ElevenLabs / xAI server-side TTS |
| `WS /ws/call/{id}` | Browser call WebSocket |
| `POST /elevenlabs/llm` | xAI custom LLM for EL agent |
| `POST /elevenlabs/call-complete` | EL end-of-call transcript webhook |
