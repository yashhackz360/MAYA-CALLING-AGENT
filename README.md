# MantaRay AI — Škoda Customer Care Agent

AI calling agent that conducts professional customer care calls for Škoda Auto India in formal Indian English. Maya — the AI customer care executive — greets customers by name, states the reason for calling with enquiry details from the database, gives the recording disclaimer, then gathers vehicle requirements through a structured discovery flow.

Built on: FastAPI backend + React frontend + xAI Grok (LLM + TTS + STT) — one API key powers everything.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13 · FastAPI · Uvicorn |
| AI Engine | xAI grok-3-fast (chat completions) |
| Voice (TTS) | ElevenLabs (Tara voice, eleven_flash_v2_5) → xAI TTS (eve) → Browser fallback |
| Voice (STT) | xAI grok-stt (batch, POST /api/stt) → Browser Web Speech API (fallback) |
| Frontend | React 18 · Vite · Vanilla CSS (light theme, Škoda green accents) |
| Realtime | WebSocket (FastAPI) |
| Container | Docker Compose |

---

## Quick Start

**Local development:**
```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install && npm run dev
# Opens at http://localhost:3000
```

**Docker:**
```bash
docker compose up --build
```

---

## Environment Variables

Use `.env.example` as a template and create your own `.env` at the project root for Docker Compose.
For local non-Docker runs, you can also use `backend/.env.example` and `frontend/.env.example`.

| Variable | Purpose |
|---|---|
| `XAI_API_KEY` | Powers everything - Grok LLM (chat), xAI TTS, xAI grok-stt STT |
| `DEEPGRAM_API_KEY` | Optional - Deepgram STT (primary STT when set) |
| `ELEVENLABS_API_KEY` | Optional - ElevenLabs Tara voice (primary TTS when set) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` / `PUBLIC_BASE_URL` | Optional - outbound calling via Twilio |

> Get your xAI key at: [console.x.ai](https://console.x.ai) -> API Keys -> Create
>
> No Groq key needed - STT now uses xAI grok-stt with the same XAI_API_KEY.

---

## How a Call Works — Maya's 2-Turn Opening + Discovery

```
Turn 1 — NAME_CONFIRM  (short, ~10 words)
  Maya: "Hello Priya, this is Maya calling from Škoda Auto India."
  <- Customer responds ->

Turn 2 — GREETING  (enquiry context + disclaimer + availability)
  Maya: "I am calling regarding your recent enquiry about the Škoda Kushaq,
         new purchase, Style variant. Please note, this call may be recorded
         for training and quality purposes. Do you have a couple of minutes, Priya?"
  <- Customer says yes or no ->

Discovery — structured conversation
  Maya gathers: model, variant, city, budget, transmission, test drive interest
  one question at a time, Indian English tone, <=25 words per response
  -> Closes with test drive booking / showroom visit / finance referral
```

### Conversation Guards

| Trigger | Maya's Response |
|---|---|
| "busy", "driving", "cut the call" | Graceful end — "I shall call at a better time" |
| "speak to a human", "transfer me" | Escalation — "Let me connect you to our senior executive" |
| Empty STT (silence) | "I am sorry, I did not catch that. Could you say that again?" |
| STT noise < 2 words | Silently discarded — mic re-opens |
| Wrong number / not the person | Apology + end call |
| 3+ consecutive blanks | "I hope we are still connected. Shall we continue?" |

---

## Agent Tone — Indian English

Maya speaks the way a professional Indian customer care executive speaks:

| Use | Avoid |
|---|---|
| "Sure", "Right", "Noted" | "Awesome", "Perfect", "Great choice" |
| "May I know", "Kindly" | "Can you tell me", "Please" |
| "Shall I arrange" | "Would you like me to" |
| "That's nice" | "I'm glad to hear that", "Thanks for confirming" |

---

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard — pipeline stats, customer activity |
| `/leads` | Lead list — search, filters, tag badges, call buttons |
| `/call-console` | AI call interface — live transcript, voice controls |
| `/lead-generation` | CRM — real-time form submission feed |
| `/enquiry` | Public enquiry form — submits lead to CRM instantly |
| `/campaigns` | Campaign performance tracking |
| `/analytics` | Deep-dive metrics |
| `/call-logs` | Complete history with transcripts |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/leads` | GET | List all leads |
| `/api/leads` | POST | Create new lead |
| `/api/calls/initiate` | POST | Start call session — returns opening message |
| `/api/calls/turn` | POST | Process one customer turn |
| `/api/calls/{id}/end` | POST | Force-end a call |
| `/api/voice/config` | GET | xAI voice backend status |
| `/api/voice/tts` | POST | Generate speech audio (xAI TTS `eve` voice) |
| `/api/stt` | POST | Transcribe audio via **xAI grok-stt** (multipart/form-data) |
| `/ws/call/{id}` | WebSocket | Real-time text-based call |
| `/ws/crm` | WebSocket | CRM lead notification broadcast |

---

## Voice Controls (Call Console)

| Control | Action |
|---|---|
| Mic button | Toggle manual listen |
| Auto button | Toggle auto-listen (1.8s cooldown after Maya speaks) |
| Mute button | Silence TTS output |
| End Call | Gracefully end, plays closing message fully before disconnecting |
| Quick-reply chips | Stage-aware suggested replies |

---

## Test Suite

```bash
cd backend
python full_system_test.py   # 36 tests — imports, LLM, TTS, STT, conversation flow, HTTP
```

---

## Documentation

- [`VOICE_AGENT_DEEP_DIVE.md`](./VOICE_AGENT_DEEP_DIVE.md) — STT/TTS pipeline, conversation engine, guards
- [`backend/README.md`](./backend/README.md) — FastAPI backend, xAI integration
- [`TECHNICAL_WALKTHROUGH.md`](./TECHNICAL_WALKTHROUGH.md) — Full technical reference

---


