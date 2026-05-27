# MAYA — Technical Walkthrough (v8 — Dealership Intelligence Layer)

Complete architecture guide covering every code path from lead creation through voice call to post-call analysis. Updated to include the new Dealership Intelligence Layer (v3.1).

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
  │     ├── ★ NEW: Dealership Intelligence sections (Nearest Dealer · Inventory · CTA)
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
        ├── POST /api/leads
        └── ★ NEW: Live dealer/inventory preview (GET /api/dealer-intelligence)

FastAPI Backend (main.py)
  ├── /api/leads           → CRUD, duplicate merge, CRM broadcast, Twilio auto-dial
  ├── /api/leads/{id}/call → manual Twilio outbound call trigger
  ├── /api/calls/logs      → call history (runtime + pre-seeded)
  ├── /api/analytics       → pipeline stats
  ├── /api/campaigns       → campaign data
  ├── /api/recordings/{sid}→ proxy Twilio recording MP3 (Basic Auth handled server-side)
  ├── /api/billing/*       → Razorpay order + HMAC signature verify
  ├── /api/dealerships     → ★ NEW: city-filtered dealership list
  ├── /api/dealerships/cities → ★ NEW: supported cities
  ├── /api/inventory       → ★ NEW: model inventory with variant detail
  ├── /api/dealer-intelligence → ★ NEW: AI-ready context strings for city+model
  ├── /ws/crm              → CRM broadcast (new_lead events)
  │
  └── twilio_handler.py (APIRouter)
        ├── POST /twilio/voice           → TwiML webhook
        └── WS /ws/twilio-stream/{sid}  → Twilio ↔ ElevenLabs audio relay
              └── _build_dynamic_variables() ★ now injects 14 vars (9 + 5 DI)

data/dealerships.py  ★ NEW
  ├── DEALERSHIPS dict  — 10 cities × 2–4 showrooms each
  ├── INVENTORY dict    — 5 Škoda models × variants (stock, price, colours, delivery)
  ├── build_dealer_intelligence(city, model, variant, transmission) → 5-key dict
  ├── get_city_context()        → dealer_info string
  ├── get_inventory_context()   → inventory_status string
  ├── get_offers_context()      → current_offers string
  ├── get_dealer_appointment_context() → appointment_prompt string
  └── list_all_cities(), list_all_models(), get_full_dealer_list()

External Services
  ├── Twilio   — outbound PSTN calls, recording storage
  ├── ElevenLabs Conversational Agent
  │     ├── STT: built-in
  │     ├── LLM: configured in EL dashboard (14 dynamic {{variables}} from backend)
  │     └── TTS: Tara voice (rfh7WrTVqLIjVSioJwdI)
  └── xAI Grok-3 — post-call transcript analysis (background, optional)
```

---

## Key Files

| File | Responsibility |
|---|---|
| `backend/main.py` | FastAPI — all REST routes, CRM WebSocket, Razorpay billing, Dealership Intelligence API, health |
| `backend/twilio_handler.py` | Twilio webhook, bidirectional audio relay, goodbye detection, call logging, DI injection, post-call analysis |
| `backend/data/sample_leads.py` | In-memory lead store — CRUD, call log store, analytics, campaigns, duplicate detection |
| `backend/data/dealerships.py` | **[NEW]** Dealership Intelligence Layer — city+dealership data, inventory, AI context builders |
| `frontend/src/App.jsx` | Sidebar navigation, BrowserRouter, auth gate, TopBar |
| `frontend/src/pages/Dashboard.jsx` | KPI cards, pipeline, `LeadToast` notification component, recent leads |
| `frontend/src/pages/Leads.jsx` | Lead list with search, tag filters, inline call trigger |
| `frontend/src/pages/LeadDetail.jsx` | Full-page lead profile + **[NEW]** 3 Dealership Intelligence sections |
| `frontend/src/pages/LeadEdit.jsx` | Full-page lead edit form — PATCH API, redirects to detail |
| `frontend/src/pages/CallLogs.jsx` | Call history table — URL `?lead=` filter, edit row navigation |
| `frontend/src/pages/CallLogEdit.jsx` | Call log edit form — status, outcome, escalation (in-memory) |
| `frontend/src/pages/LeadGeneration.jsx` | Live enquiry feed via `/ws/crm` |
| `frontend/src/pages/EnquiryPage.jsx` | Public customer enquiry form + **[NEW]** live dealer/inventory preview |
| `frontend/src/pages/Billing.jsx` | Invoices, Razorpay payment flow, cost estimator |
| `frontend/src/pages/LoginPage.jsx` | Auth gate — demo credentials, sessionStorage |
| `frontend/src/index.css` | Global design system + **[NEW]** `di-*` Dealership Intelligence CSS classes |

---

## Dealership Intelligence Layer (New in v3.1)

### Overview

The Dealership Intelligence Layer makes Maya sound locally aware during every call. It is a pure Python data layer with no external dependencies — all data is pre-loaded in `backend/data/dealerships.py`.

### Data Coverage

| Dataset | Coverage |
|---|---|
| Cities | 10 major Indian cities: Bangalore, Mumbai, Delhi, Hyderabad, Pune, Chennai, Kolkata, Ahmedabad, Jaipur, Kochi |
| Dealerships | 21 showrooms total (2–4 per city) with area, address, phone, manager, rating, hours, services |
| Models | 5 current Škoda India models: Kushaq, Slavia, Kodiaq, Superb, Enyaq |
| Variants | 18 variant entries with ex-showroom price, stock status, stock count, delivery weeks, colours, highlights |
| City Aliases | 40+ city alias normalizations (e.g. "Bengaluru" → `"bangalore"`, "Gurugram" → `"delhi"`) |

### Function Reference

```python
# Master context builder — used by twilio_handler._build_dynamic_variables()
build_dealer_intelligence(city, model, variant, transmission) → {
    "dealer_info":        str,   # e.g. "We have 3 Škoda showrooms in Bangalore..."
    "inventory_status":   str,   # e.g. "Škoda Kushaq Style 1.5 TSI AT: 2 units left..."
    "current_offers":     str,   # e.g. "Exchange bonus ₹50,000 | Loyalty benefit ₹25,000"
    "appointment_prompt": str,   # e.g. "I can book you a test drive at Škoda Whitefield..."
    "city_served":        str,   # e.g. "Bangalore"
}

# Individual helpers
get_city_context(city)                             → str
get_inventory_context(model, variant, transmission) → str
get_offers_context(model)                          → str
get_dealer_appointment_context(city)               → str

# Listing helpers (used by API endpoints)
list_all_cities()        → list[str]
list_all_models()        → list[str]
get_full_dealer_list()   → list[dict]
get_dealers_for_city(city) → list[dict]
get_dealer_for_city(city, preferred_area) → dict | None
get_inventory_for_model(model) → dict | None
get_variant_availability(model, variant_hint) → list[dict]
```

### Injection into ElevenLabs (`twilio_handler.py`)

`_build_dynamic_variables(lead)` now returns **14 variables** (previously 9):

```python
# Original 9 variables (unchanged)
customer_name, vehicle_interest, budget, transmission,
location, enquiry_type, purpose, lead_tag, notes

# New 5 Dealership Intelligence variables
dealer_info, inventory_status, current_offers,
appointment_prompt, city_served
```

These are injected into ElevenLabs via `conversation_initiation_client_data` → `dynamic_variables` list, mapping to `{{placeholder}}` tokens in the system prompt.

### API Endpoints

```
GET /api/dealerships
    ?city=bangalore  → filtered list of dealerships for that city
    (no param)       → all dealerships + supported cities list

GET /api/dealerships/cities
    → ["ahmedabad", "bangalore", "chennai", ...]

GET /api/inventory
    ?model=Škoda Kushaq   → full model data + variant availability
    ?model=...&variant=Style  → filtered variant only
    (no param)            → summary of all models

GET /api/dealer-intelligence?city=Bangalore&model=Škoda Kushaq
    → {
        "city": "Bangalore",
        "model": "Škoda Kushaq",
        "intelligence": {
            "dealer_info": "...",
            "inventory_status": "...",
            "current_offers": "...",
            "appointment_prompt": "...",
            "city_served": "Bangalore"
        }
      }
```

### Frontend Integration

**EnquiryPage.jsx** — Live preview as the customer fills the form:
```
City selected + Model selected
  → useEffect fires
  → GET /api/dealer-intelligence?city=<city>&model=<model>
  → di-inline-preview shows dealer_info, inventory_status, current_offers
  → Updates in real-time as city/model selection changes
```

**LeadDetail.jsx** — 3 new sections per lead:
```
lead.preferences.location set
  → useEffect fires after lead loaded
  → GET /api/dealer-intelligence?city=<city>&model=<model>
  → Section 1: "Nearest Dealership" — di-dealer-card + di-ai-context
  → Section 2: "Inventory & Offers" — di-ai-context + di-offers-banner
  → Section 3: "Recommended Action" — di-appointment-cta button
```

### CSS Design System (`di-*` classes in `index.css`)

| Class | Element |
|---|---|
| `.di-dealer-card` | Dealer info card with left blue accent bar, hover lift |
| `.di-dealer-header` / `.di-dealer-icon` | Card header with icon and rating |
| `.di-stock-badge` | Stock status pill (4 variants: available/limited/request/waitlisted) |
| `.di-inventory-panel` | Variant list panel with header and tagline |
| `.di-variant-row` | Per-variant row with name, price, delivery, colours |
| `.di-colour-chip` | Small colour label chips |
| `.di-offers-banner` | Gold gradient offers callout with emoji icon |
| `.di-section` / `.di-section-title` | Section divider with auto-expanding rule line |
| `.di-ai-context` | Blue gradient AI context info box with 🤖 watermark |
| `.di-appointment-cta` | Blue gradient CTA button with arrow, hover lift |
| `.di-city-selector` / `.di-city-chip` | City grid selector with selected state |
| `.di-inline-preview` | Inline text preview, turns blue when data loaded |

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

3. Connect to ElevenLabs
   └── wss://api.elevenlabs.io/v1/convai/conversation?agent_id={ELEVENLABS_AGENT_ID}

4. Receive conversation_initiation_metadata (10s timeout)
   └── reads agent_output_audio_format + conversation_id

5. Send per-call config override including dynamic_variables
   └── type: "conversation_initiation_client_data"
       conversation_config_override:
         agent.first_message: "Hello {name}, this is Maya calling from Skoda..."
         tts.voice_id: "rfh7WrTVqLIjVSioJwdI"  (Tara)
       dynamic_variables: [
         {name: "customer_name", value: "Priya"},
         {name: "vehicle_interest", value: "Škoda Kushaq Style"},
         {name: "dealer_info", value: "We have 3 Škoda showrooms in Bangalore..."},
         {name: "inventory_status", value: "Škoda Kushaq Style 1.5 TSI AT: 2 units left..."},
         {name: "current_offers", value: "Exchange bonus ₹50,000..."},
         {name: "appointment_prompt", value: "I can book you a test drive at..."},
         {name: "city_served", value: "Bangalore"},
         ... (9 more vars)
       ]

6. asyncio.gather() runs both coroutines concurrently:
   ├── twilio_to_elevenlabs()  — inbound customer audio
   └── elevenlabs_to_twilio()  — outbound Maya audio + event handling

7. Goodbye detection → _hangup_twilio_call(call_sid) → call ends

8. finally block → add_call_log() + add_call_to_lead() + _post_call_analysis()
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

### _analyze_transcript (xAI Grok-3)

Sends full transcript to `https://api.x.ai/v1/chat/completions`. Expected response:

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

```
EnquiryPage (browser) submits form
  → POST /api/leads  (new lead only — duplicates don't broadcast)

backend main.py:
  → broadcast_new_lead(lead)
  → iterates _crm_clients set
  → sends JSON: { "type": "new_lead", "lead": {...}, "message": "...", "timestamp": "..." }
  → dead connections removed from set

Dashboard.jsx:
  → WebSocket onmessage → type==="new_lead" → LeadToast renders (9s auto-dismiss)

LeadGeneration.jsx:
  → WebSocket onmessage → prepends lead to live feed table
```

---

## ElevenLabs Agent Configuration

| Setting | Value |
|---|---|
| Voice | Tara — `rfh7WrTVqLIjVSioJwdI` |
| First message | Overridden per-call |
| Dynamic variables | 14 vars injected — 9 CRM + 5 Dealership Intelligence |
| System prompt | Škoda Maya persona — see `VOICE_AGENT_DEEP_DIVE.md` for current prompt |

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

## In-Memory Data Store (`data/sample_leads.py`)

### Lead Object Schema

```python
{
  "lead_id":             "lead_001",
  "name":                "Priya Sharma",
  "phone":               "+91 98765 43210",
  "email":               "priya@infosys.com",
  "source":              "Website",
  "preferred_language":  "english",           # english / hindi / hinglish
  "status":              "New",               # New / Contacted / Qualified / Closed / Lost / Re-enquiry
  "tag":                 "Hot",               # Hot / Warm / Cold
  "created_at":          "2026-05-06T...",
  "preferences": {
    "location":          "Bangalore",         # used to query dealerships.py
    "vehicle_model":     "Škoda Kushaq",      # used to query inventory
    "variant":           "Style",
    "budget":            "₹16–18 Lakhs",
    "transmission":      "Automatic",
    "enquiry_type":      "New Purchase",
    "notes":             "..."
  },
  "call_history":        [...],
  "ai_analysis":         {...},               # Grok analysis (post-call)
  "enquiry_count":       1,
  "contact_consent":     true,
}
```

---

## Logging (`twilio_relay.log`)

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
- **Dealership data is static** — `dealerships.py` is a mock dataset; no live inventory API integration
- **No multi-tenancy** — single shared in-memory store
