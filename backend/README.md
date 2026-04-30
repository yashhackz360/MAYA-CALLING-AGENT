# MantaRay AI — Škoda Customer Care Agent Backend

FastAPI backend powering the MantaRay AI calling agent for Škoda Auto India. Manages call sessions, drives the conversation state machine, and integrates with xAI Grok Voice Agent for generating Maya's responses and voice output.

---

## Architecture

```
backend/
├── main.py                  # FastAPI app — REST + WebSocket + xAI Voice endpoints
├── .env                     # API keys (not committed)
├── requirements.txt         # Python dependencies
│
├── agent/
│   ├── conversation.py      # 5-state conversation engine (NAME_CONFIRM → ENDED)
│   └── llm_client.py        # xAI Grok client: chat completions + voice agent config
│
├── call_manager/
│   └── manager.py           # Session registry, call lifecycle, result persistence
│
└── data/
    └── sample_leads.py      # In-memory lead store (seeded Škoda customer data)
```

---

## Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env — add XAI_API_KEY

# Start server
uvicorn main:app --reload --port 8000
```

### Environment Variables

```env
# xAI API Key — powers Grok chat, TTS, and Realtime Voice Agent
# Get your key at: https://console.x.ai → API Keys → Create
XAI_API_KEY=your_xai_api_key_here
```

---

## AI Backend — xAI Grok

The system uses xAI's Grok model suite:

```
1. xAI Grok (text mode)       — Chat completions for text-based call flow
2. xAI TTS (voice output)     — High-quality speech via /v1/tts API (voice: "eve")
3. xAI Realtime (speech-to-speech) — Full duplex WebSocket via /v1/realtime
        ↓  if XAI_API_KEY not set
4. Context-aware rule-based    (always works, no API needed)
```

Startup log shows which backend is active:
```
[LLM] OK  xAI Grok Voice Agent ready
```
or
```
[LLM] WARN No XAI_API_KEY set — using rule-based fallback
```

---

## Conversation Engine (`agent/conversation.py`)

### States

| State | Description |
|---|---|
| `NAME_CONFIRM` | Opening turn — "Hello! Am I speaking with [Name]?" |
| `GREETING` | Introduction + "Do you have 5 minutes?" |
| `DISCOVERY` | LLM-driven 10-question customer care flow |
| `ESCALATION` | Transfer to human customer care executive |
| `ENDED` | Call complete |

### State Transitions

```
NAME_CONFIRM
    ├── name confirmed     → GREETING
    └── wrong number       → ENDED

GREETING
    ├── customer available → DISCOVERY
    └── customer busy      → ENDED

DISCOVERY (any turn)
    ├── "busy / cut call"  → ENDED  (proactive detection)
    ├── "speak to human"   → ESCALATION → ENDED
    ├── "bye / no thanks"  → ENDED (with summary)
    └── normal input       → LLM response (stay in DISCOVERY)
```

### Input Guards

| Condition | Behaviour |
|---|---|
| Empty input | "I am sorry, I did not catch that. Could you kindly say that again?" |
| Short input during DISCOVERY (< 2 words, < 6 chars) | Polite repeat request, max 2 retries |
| 3+ consecutive empty inputs | Gently advance: "Shall I continue?" |
| Wrong number / not the person | Immediate graceful end |

### In-Memory Profile Extraction

Every customer turn is parsed for vehicle facts before the LLM call:

```python
# Extracted automatically from free-form speech
preferences = {
    "vehicle_model": "Škoda Kushaq",         # from "interested in Kushaq"
    "variant":       "Monte Carlo",           # from "Monte Carlo variant"
    "location":      "Bangalore",             # from "I am in Bangalore"
    "budget":        "Rs.15-18 lakh",         # from "15 to 18 lakhs"
    "transmission":  "Automatic",             # from "automatic please"
    "enquiry_type":  "New Purchase",          # from "looking to buy"
}
```

Extracted data is injected into the LLM prompt on the next turn, so Maya always has up-to-date context.

---

## LLM Client (`agent/llm_client.py`)

### System Prompt Characteristics

- **Persona**: Maya — educated, professional Indian customer care executive at Škoda
- **Language**: Formal Indian English
  - Uses: "Kindly", "May I know", "Certainly", "Shall I", "Regarding", "Noted"
  - Avoids: "awesome", "cool", "totally", "gonna", "wanna", "for sure"
- **Question length**: Maximum 10–15 words per question (enforced in prompt)
- **Response length**: 2 sentences maximum per turn
- **Discovery flow**: Explicit 10-question sequence (Q1–Q10) in system prompt
- **One question per turn**: Strictly enforced — no compound questions

### TTS Preprocessing (`humanize_for_speech`)

Output from LLM is cleaned before sending to TTS:
- `₹` → `rupees` · `TSI` → `T S I` · `1.5Cr` → `1.5 crore`
- `DSG` → `D S G` · `EMI` → `E M I` · `SUV` → `S U V`
- Markdown stripped · Bullet lists removed · "Maya:" prefix stripped

---

## API Endpoints

### REST

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/calls/initiate` | `{ lead_id }` | `{ call_id, opening_message, state }` |
| `POST` | `/api/calls/turn` | `{ call_id, user_input }` | `{ agent_text, state, call_ended, escalated }` |
| `POST` | `/api/calls/{id}/end` | — | `{ call_id, status }` |
| `GET` | `/api/leads` | — | Array of leads |
| `POST` | `/api/leads` | lead object | Created lead |
| `GET` | `/api/calls/active` | — | Active session list |
| `GET` | `/api/analytics` | — | Stats summary |
| `GET` | `/api/voice/config` | — | xAI voice backend status |
| `POST` | `/api/voice/session-config/{lead_id}` | — | xAI session.update payload |
| `POST` | `/api/voice/tts` | `{ text, voice }` | `{ audio (base64 MP3), format }` |

### WebSocket

```
ws://localhost:8000/ws/call/{call_id}     — Text-based call session
ws://localhost:8000/ws/voice/{call_id}    — xAI Realtime Voice proxy
ws://localhost:8000/ws/crm               — CRM lead notifications
```

---

## Dependencies

```
fastapi==0.115.0       # Web framework
uvicorn[standard]      # ASGI server
websockets==13.0.1     # WebSocket support (+ xAI Realtime proxy)
pydantic==2.9.2        # Request/response validation
python-dotenv==1.0.1   # .env file loading
httpx==0.27.2          # HTTP client (xAI chat completions + TTS)
```
