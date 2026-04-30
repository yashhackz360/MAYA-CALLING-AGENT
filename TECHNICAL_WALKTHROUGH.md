# MantaRay AI — Technical Walkthrough (v4)

## Architecture Overview

```
Browser (React)
  |-- Call Console (CallConsole.jsx)
  |     |-- ElevenLabs TTS  -> xAI TTS -> Browser SpeechSynthesis  [TTS chain]
  |     |-- MediaRecorder -> POST /api/stt (xAI grok-stt)          [STT]
  |     |-- WebSocket /ws/call/{id}                                  [realtime text]
  |
FastAPI Backend (main.py)
  |-- /api/calls/initiate  -> call_manager.initiate_call()
  |-- /api/calls/turn      -> call_manager.process_turn()
  |-- /api/voice/tts       -> agent.llm_client.tts()   (xAI TTS)
  |-- /api/stt             -> xAI grok-stt API
  |-- /ws/call/{id}        -> WebSocket turn handler
  |-- /ws/crm              -> CRM broadcast to LeadGeneration page
  |
agent/
  |-- conversation.py      -> 5-state machine + hardcoded 2-turn opening
  |-- llm_client.py        -> xAI grok-3-fast chat completions + TTS + system prompt
  |
data/
  |-- sample_leads.py      -> in-memory lead store (10 Škoda leads across 5 cities)
  |
call_manager/
  |-- manager.py           -> session lifecycle, process_turn orchestration
```

---

## Key Files and What They Do

| File | Responsibility |
|---|---|
| `backend/agent/conversation.py` | 5-state machine, `get_opening_message()`, state handlers |
| `backend/agent/llm_client.py` | SYSTEM_PROMPT, `get_ai_response()`, `tts()`, `humanize_for_speech()` |
| `backend/main.py` | FastAPI routes, `/api/stt` (xAI grok-stt), `/api/voice/tts` |
| `backend/call_manager/manager.py` | Session store, `initiate_call()`, `process_turn()`, `end_call()` |
| `backend/data/sample_leads.py` | Lead CRUD, analytics, campaigns |
| `frontend/src/pages/CallConsole.jsx` | TTS player, STT recorder, WebSocket, call UI |
| `frontend/src/pages/LoginPage.jsx` | Auth gate (demo credentials) |
| `frontend/src/App.jsx` | Sidebar, routing, topbar |
| `frontend/src/index.css` | Global design system (Škoda green, light theme) |

---

## Voice Pipeline Detail

### STT Flow
```
1. User speaks
2. MediaRecorder records WebM/audio chunks
3. AudioContext analyser detects 1.2s silence
4. Chunks POSTed to POST /api/stt as multipart/form-data
5. Backend: xAI grok-stt (POST https://api.x.ai/v1/stt, model=grok-stt)
6. Returns: { "text": "..." }
7. Frontend fires handleSpeechResult(text)
8. If xAI fails: falls back to browser webkitSpeechRecognition
```

### TTS Flow
```
1. Backend returns agent_text from process_turn
2. Frontend POSTs to POST /api/voice/tts { text, voice: "eve" }
3. Backend calls xAI TTS -> returns base64 audio
4. Frontend plays via <audio> element (or ElevenLabs if key set)
5. On audio end: isProcessingRef = false -> 1800ms cooldown -> mic restarts
6. On end-call: 8000ms delay before UI transition (voice finishes fully)
```

### LLM Flow
```
1. process_turn() called with user_input
2. _extract_and_update_profile() updates lead preferences
3. State machine checks current state (NAME_CONFIRM / GREETING / DISCOVERY / ENDED)
4. DISCOVERY: get_ai_response() -> xAI grok-3-fast (max_tokens=80)
5. Response humanized via humanize_for_speech()
6. agent_text returned to frontend
```

---

## System Prompt Design

The system prompt in `llm_client.py` governs Maya's entire persona:

- **Identity:** Customer executive at Škoda Auto India, on a live phone call
- **Language:** Indian English — "kindly", "may I know", "shall I arrange", "noted"
- **Tone:** Professional and respectful, not casual or American
- **Rules:** Max 2 sentences (≤25 words), one question per turn, no markdown/emojis/bullets
- **Knowledge:** Kushaq (₹11.89L–17.99L), Slavia, Superb, Kodiaq, service schedule, finance options

---

## Opening Sequence (2-Turn Design)

Turn 1 and Turn 2 are **hardcoded strings** — no LLM call — for zero latency:

```python
# Turn 1 (NAME_CONFIRM state):
f"Hello {first_name}, this is Maya calling from Škoda Auto India."

# Turn 2 (GREETING state, after customer confirms):
f"I am calling regarding your recent enquiry{enquiry_detail}. "
f"Please note, this call may be recorded for training and quality purposes. "
f"Do you have a couple of minutes to talk, {first_name}?"
```

The enquiry_detail is pulled from `lead["preferences"]` (vehicle_model, enquiry_type, variant).

---

## API Keys Summary

| Key | Where | Powers |
|---|---|---|
| `XAI_API_KEY` | `backend/.env` | grok-3-fast LLM + xAI TTS (eve) + xAI grok-stt STT |
| `ELEVENLABS_API_KEY` | `backend/.env` | ElevenLabs Tara TTS (primary when set) |

No Groq key needed. xAI grok-stt replaced Groq Whisper for STT in v4.

---

## Test Suite

```bash
cd backend
python full_system_test.py
```

Covers 10 sections, 36 tests:
1. Imports
2. Environment variables
3. LLM backend init + system prompt validation
4. Data layer (leads CRUD)
5. Opening message format
6. TTS text preprocessing
7. Call manager initiate
8. Live xAI grok-3-fast API call
9. Full 7-turn conversation flow
10. HTTP endpoint tests (requires backend running)

---

## Frontend Design System

- **Theme:** Light/white (user preference)
- **Brand color:** Škoda Green `#4ba82e` — replaces old indigo throughout
- **Typography:** Inter (Google Fonts)
- **Sidebar:** "MantaRay AI / Škoda Auto India" branding, Phone icon
- **Footer:** "© 2026 House of Mantaray · Powered by xAI Grok"
- **Topbar:** Dark frosted glass, Škoda green "System Online" indicator

---

## Known Limitations

- No real telephony (Twilio/SIP) — browser simulation only
- STT is batch (record then send), not streaming
- In-memory data store — resets on backend restart
- No authentication beyond demo credentials
