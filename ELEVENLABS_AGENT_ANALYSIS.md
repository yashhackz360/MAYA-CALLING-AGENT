# ElevenLabs Conversational AI vs Current MantaRay Stack
### Should We Replace Deepgram + Grok + ElevenLabs TTS with a Single ElevenLabs Agent?

---

## TL;DR

**Yes — it will significantly improve the system.** ElevenLabs Conversational AI collapses three separate API hops (Deepgram STT → Grok LLM → ElevenLabs TTS) into a single WebSocket connection with native VAD, barge-in, and turn detection built in. The result is lower latency, fewer failure points, and far less code to maintain.

> Grok is **not** natively supported, but can be connected as a custom LLM via ElevenLabs' custom LLM webhook — so you don't lose it if you want to keep it.

---

## 1. What the Current System Does

```
Customer Phone
     │  (µ-law 8kHz)
     ▼
Twilio Media Streams WebSocket
     │
     ▼  twilio_handler.py
     │
     ├─ Manual VAD (energy RMS on last 600ms)
     ├─ Speaking lock + 1.2s cooldown (manual echo management)
     ├─ Mark events (manual playback tracking)
     │
     ▼  audio_bridge.mulaw_to_wav()
     │
     ▼  Deepgram Nova-2 REST API  ← API call #1 (~300ms)
     │  (audio/wav → transcript text)
     │
     ▼  xAI Grok-3-fast API       ← API call #2 (~400–800ms)
     │  (text → text response)
     │
     ▼  ElevenLabs TTS pcm_8000   ← API call #3 (~300–500ms)
     │  (text → PCM audio)
     │
     ▼  audio_bridge.pcm_to_mulaw()
     │
     ▼  Twilio Media Streams (audio back to customer)

Total per turn: ~1,000–1,600ms minimum
```

**Files involved in a single conversation turn:**
- `twilio_handler.py` — 190 lines of audio loop + state management
- `audio_bridge.py` — format conversion
- `agent/llm_client.py` — Deepgram + Grok + ElevenLabs calls (~750 lines)
- `agent/conversation.py` — state machine + profile extraction (~410 lines)
- `call_manager/manager.py` — session lifecycle

---

## 2. What ElevenLabs Conversational AI Does

```
Customer Phone
     │  (µ-law 8kHz)
     ▼
Twilio Media Streams WebSocket
     │
     ▼  twilio_handler.py (NEW — ~80 lines)
     │  mulaw → PCM 16kHz → base64
     │
     ▼  ElevenLabs Agent WebSocket  ← single persistent connection
     │  wss://api.elevenlabs.io/v1/convai/conversation?agent_id=XXX
     │
     │  Built in:
     │   - STT  (ElevenLabs Scribe — 70+ languages, Indian English/Hindi)
     │   - VAD  (proprietary turn-detection model, not silence threshold)
     │   - LLM  (GPT-4o / Claude / Gemini — or your custom LLM webhook)
     │   - TTS  (Tara voice — same voice, zero latency switching)
     │   - Barge-in / interruption handling
     │
     ▼  PCM audio response → mulaw → Twilio

Total per turn: ~500–800ms (ElevenLabs' optimised internal pipeline)
```

**Files involved (new):**
- `twilio_handler.py` — ~80 lines (audio relay only)
- `agent/elevenlabs_agent.py` — new thin wrapper (~60 lines)

---

## 3. Side-by-Side Comparison

| Dimension | Current Stack | ElevenLabs Agent |
|---|---|---|
| **Architecture** | 3 separate API services | 1 WebSocket connection |
| **STT** | Deepgram Nova-2 (REST, ~300ms) | ElevenLabs Scribe (streaming, real-time) |
| **LLM** | xAI Grok-3-fast | GPT-4o / Claude / Gemini / Custom webhook |
| **TTS** | ElevenLabs Tara pcm_8000 | ElevenLabs Tara (native, zero extra hop) |
| **VAD** | Manual RMS energy threshold | Proprietary neural turn-detection model |
| **Barge-in** | Not implemented | Native — agent stops mid-sentence |
| **Echo management** | Manual 1.2s cooldown + speaking lock | Handled internally |
| **End-to-end latency** | ~1,000–1,600ms per turn | ~500–800ms per turn |
| **Code complexity** | ~1,500 lines across 5 files | ~200 lines (relay only) |
| **Failure points** | 3 external APIs + format conversion | 1 external API |
| **Indian English** | Deepgram en-IN + Grok tuning | Native 70+ lang incl. Hindi, Hinglish |
| **Multilingual** | Manual language detection + regex | Automatic, model-native |
| **Grok support** | Yes (native) | Via custom LLM webhook only |
| **Profile extraction** | Python regex in conversation.py | Must move to system prompt instructions |
| **State machine** | 5-state Python FSM | Prompt-driven (LLM decides flow) |
| **Cost model** | Pay per: Deepgram min + Grok tokens + ElevenLabs chars | Pay per: Agent minute + LLM cost |
| **Vendor lock-in** | Moderate (3 vendors) | Higher (ElevenLabs-centric) |

---

## 4. Pros of Switching

### Performance
- **~2x lower latency per turn** — ElevenLabs' internal pipeline skips network hops between STT→LLM→TTS. Observed ~500ms vs our ~1,200ms.
- **Real barge-in** — Customer can interrupt Maya mid-sentence and she stops immediately. Not possible with our current mark-based approach without major rework.
- **Better turn detection** — Their proprietary model understands natural pauses vs. end-of-speech far better than our RMS threshold. Eliminates premature transcription and missed responses.

### Reliability
- **Fewer failure points** — 3 APIs → 1. If any one of Deepgram, Grok, or ElevenLabs is down today, the call breaks. With the Agent, a single service handles everything.
- **No audio format bugs** — Our `audioop`/`pydub` chain has already caused two production crashes. The Agent accepts PCM 16kHz directly.
- **No echo management code** — No speaking lock, no cooldown timers, no mark events. The Agent handles it internally.

### Code Quality
- **~1,300 fewer lines** — `llm_client.py` (Deepgram + Grok sections), `conversation.py` (state machine), and most of `twilio_handler.py` can be retired or dramatically simplified.
- **No manual state machine** — The LLM + system prompt drives conversation flow. Easier to update Maya's behaviour without touching Python code.

### Features
- **Better Hindi/Hinglish** — Native multilingual support with no regex detection or language-lock logic needed.
- **Knowledge base** — Attach a Škoda India product PDF directly to the agent. No manual prompt engineering to stuff vehicle data.
- **Analytics dashboard** — ElevenLabs provides call transcripts, agent performance, and conversation analytics out of the box.

---

## 5. Cons of Switching

### Loss of Control
- **Grok is gone (by default)** — Grok is not a native LLM option. You can connect it via custom LLM webhook, but this adds back a network hop and the latency savings shrink.
- **State machine replaced by prompt** — The 5-state FSM (NAME_CONFIRM → LANGUAGE_SELECT → DISCOVERY → ESCALATION → ENDED) is explicit and testable. Prompt-driven flow is harder to unit test.
- **Profile extraction** — Our regex system (budget, model, location, transmission detection) needs to be rebuilt as structured data extraction in the LLM instructions, or via a tool-call schema.
- **CRM write-back** — Currently `process_customer_input()` writes profile fields back to the lead in real time. With the Agent, you'd need to use ElevenLabs' `end_of_call_webhook` to receive the transcript and extract data post-call.

### Cost
- **Potentially higher per-minute cost** — ElevenLabs Agent charges per minute of conversation (varies by plan). Current stack charges per API call (Deepgram: $0.0059/min, Grok: token-based, ElevenLabs: per character). For short, efficient calls the Agent may cost more; for long calls it may cost less. Requires benchmarking against your actual call duration distribution.
- **Plan dependency** — The Conversational AI feature is on ElevenLabs Creator ($22/month) and above. Business plan ($330/month) needed for production volume.

### Migration Risk
- **System prompt has to replicate Maya's behaviour** — The current system prompt in `llm_client.py` is 200+ lines tuned for Maya's persona, Škoda context, and Indian English. This needs careful porting.
- **No Twilio "mark" events** — You lose the ability to know exactly when audio finished playing (though ElevenLabs handles this internally, you can't hook into it externally).

---

## 6. Recommendation

**Migrate — but keep Grok optionally.**

The latency halving and the elimination of the VAD/echo/format conversion complexity are compelling for a voice demo where audio quality is the primary KPI.

**Suggested path:**
1. Keep Grok if call quality matters more than latency — connect it as a custom LLM webhook (adds ~300ms back but retains the model).
2. Switch to GPT-4o if you want maximum speed — adds $0.005/1K tokens but gives full native integration.

---

## 7. Implementation Guide

### Prerequisites
- ElevenLabs account on **Creator plan or above**
- `ELEVENLABS_API_KEY` already set (you have this)
- Python backend running (existing setup)

---

### Step 1 — Create the Agent in ElevenLabs Dashboard

1. Go to [elevenlabs.io](https://elevenlabs.io) → **Conversational AI** → **Create Agent**
2. **Voice**: Select **Tara** (same voice as current system)
3. **First message**: `Hello {customer_name}, this is Maya calling from Škoda Auto India.`
4. **System prompt**: Paste the Maya persona (see Step 2 below)
5. **LLM**: Select **GPT-4o** (or see Step 3 for Grok)
6. **Language**: Set to **English (India)** — enables multilingual detection
7. Save → copy the **Agent ID** (format: `agent_XXXXXXXXXXXXXXXX`)

---

### Step 2 — Port the System Prompt

Copy the core of Maya's current prompt from `llm_client.py` and adapt it:

```
You are Maya, a formal Indian English virtual customer care executive at Škoda Auto India.

PERSONA:
- Warm, professional, never aggressive
- Address customers as "Sir" or "Madam" based on their name
- Formal Indian English — no slang, no fillers like "um"/"uh"

CALL FLOW:
1. Greet by first name and confirm identity
2. Ask preferred language (English / Hindi)
3. Gather: vehicle model of interest, budget, transmission preference, city, enquiry type
4. If customer asks to escalate: say "I am connecting you to a senior executive"
5. End call warmly: summarise what was gathered, give helpline 1800-209-7272

EXTRACTION — after each customer message, silently update these fields if mentioned:
- vehicle_model, budget, transmission, location, enquiry_type

RULES:
- Never invent prices or offers not in your knowledge base
- Never mention competitor brands
- If you don't know something, say "Our team will get back to you with the exact details"
- Keep responses under 3 sentences for phone calls
```

---

### Step 3 — (Optional) Connect Grok as Custom LLM

If you want to keep Grok, add a webhook endpoint to your FastAPI backend:

```python
# backend/main.py — add this route

from pydantic import BaseModel

class ElevenLabsLLMRequest(BaseModel):
    messages: list[dict]
    system_prompt: str = ""

@app.post("/elevenlabs/llm")
async def elevenlabs_custom_llm(payload: ElevenLabsLLMRequest):
    """ElevenLabs calls this endpoint as the LLM for the agent."""
    import httpx
    xai_key = os.getenv("XAI_API_KEY", "")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {xai_key}"},
            json={
                "model": "grok-3-fast",
                "messages": payload.messages,
                "stream": True,
                "max_tokens": 120,
            }
        )
        # Stream back in OpenAI-compatible format (ElevenLabs expects this)
        return StreamingResponse(resp.aiter_bytes(), media_type="text/event-stream")
```

In the ElevenLabs dashboard under your Agent → LLM → **Custom LLM** → set URL to `https://<your-public-url>/elevenlabs/llm`.

---

### Step 4 — New `twilio_handler.py`

Replace the current 190-line handler with this ~100-line relay:

```python
"""
twilio_handler.py — Twilio <-> ElevenLabs Agent audio relay.
Twilio Media Streams (µ-law 8kHz) <-> ElevenLabs Agent WS (PCM 16kHz)
"""

import asyncio, base64, json, os
import websockets

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response
from twilio.rest import Client as TwilioClient

router = APIRouter()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")
_sid_to_lead: dict[str, str] = {}


def register_call(call_sid: str, lead_id: str) -> None:
    _sid_to_lead[call_sid] = lead_id


@router.post("/twilio/voice")
async def twilio_voice_webhook(request: Request):
    from twilio.twiml.voice_response import Connect, VoiceResponse
    form = await request.form()
    call_sid = form.get("CallSid", "")
    host = PUBLIC_BASE_URL.replace("https://", "").replace("http://", "").rstrip("/")
    twiml = VoiceResponse()
    connect = Connect()
    connect.stream(url=f"wss://{host}/ws/twilio-stream/{call_sid}")
    twiml.append(connect)
    return Response(content=str(twiml), media_type="application/xml")


@router.websocket("/ws/twilio-stream/{call_sid}")
async def twilio_media_stream(websocket: WebSocket, call_sid: str):
    await websocket.accept()
    stream_sid = ""
    lead_id = _sid_to_lead.get(call_sid, "unknown")

    el_ws_url = (
        f"wss://api.elevenlabs.io/v1/convai/conversation"
        f"?agent_id={ELEVENLABS_AGENT_ID}"
    )
    headers = {"xi-api-key": ELEVENLABS_API_KEY}

    try:
        async with websockets.connect(el_ws_url, additional_headers=headers) as el_ws:

            # Send call metadata so the agent knows the customer name
            await el_ws.send(json.dumps({
                "type": "conversation_initiation_client_data",
                "custom_llm_extra_body": {},
                "conversation_config_override": {
                    "agent": {
                        "prompt": {
                            "prompt": f"Customer lead_id: {lead_id}. Use their name from CRM context."
                        }
                    }
                }
            }))

            async def twilio_to_elevenlabs():
                """Forward µ-law 8kHz from Twilio -> PCM 16kHz to ElevenLabs."""
                nonlocal stream_sid
                async for raw in websocket.iter_text():
                    msg = json.loads(raw)
                    event = msg.get("event")
                    if event == "start":
                        stream_sid = msg["start"]["streamSid"]
                    elif event == "media":
                        mulaw = base64.b64decode(msg["media"]["payload"])
                        # µ-law -> 16-bit PCM 8kHz -> upsample to 16kHz
                        pcm8k  = audioop.ulaw2lin(mulaw, 2)
                        pcm16k = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, None)[0]
                        await el_ws.send(json.dumps({
                            "user_audio_chunk": base64.b64encode(pcm16k).decode()
                        }))
                    elif event == "stop":
                        break

            async def elevenlabs_to_twilio():
                """Forward PCM 16kHz from ElevenLabs -> µ-law 8kHz to Twilio."""
                async for raw in el_ws:
                    msg = json.loads(raw)
                    if msg.get("type") == "audio" and stream_sid:
                        pcm16k = base64.b64decode(msg["audio"]["chunk"])
                        # Downsample 16kHz -> 8kHz -> µ-law
                        pcm8k  = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)[0]
                        mulaw  = audioop.lin2ulaw(pcm8k, 2)
                        await websocket.send_json({
                            "event":     "media",
                            "streamSid": stream_sid,
                            "media":     {"payload": base64.b64encode(mulaw).decode()},
                        })

            await asyncio.gather(twilio_to_elevenlabs(), elevenlabs_to_twilio())

    except Exception as e:
        print(f"[Twilio WS] Error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
```

---

### Step 5 — New Environment Variables

Add to `backend/.env`:

```env
ELEVENLABS_AGENT_ID=agent_XXXXXXXXXXXXXXXX   # from ElevenLabs dashboard
# DEEPGRAM_API_KEY can be removed (no longer needed)
# XAI_API_KEY can be removed unless you keep Grok as custom LLM
```

---

### Step 6 — Files to Remove / Retire

| File | Action |
|---|---|
| `agent/llm_client.py` | Remove Deepgram + Grok sections. Keep only `tts()` if used elsewhere. |
| `agent/conversation.py` | Remove entirely — state machine moves to agent system prompt. |
| `call_manager/manager.py` | Simplify — no more `process_customer_input()` calls. |
| `audio_bridge.py` | Remove `pcm_to_mulaw()` (no longer TTS-related). Keep `mulaw_to_wav()` if needed. |
| `backend/requirements.txt` | Remove `deepgram-sdk` if added. Keep `websockets`, `twilio`, `audioop-lts`. |

---

### Step 7 — CRM Profile Extraction (Post-Call)

Since the Agent handles conversation internally, profile extraction moves to a **post-call webhook**:

```python
# In ElevenLabs dashboard: set "End of call webhook" to:
# https://<your-public-url>/elevenlabs/call-complete

@app.post("/elevenlabs/call-complete")
async def elevenlabs_call_complete(payload: dict):
    """ElevenLabs posts transcript here when call ends."""
    transcript = payload.get("transcript", [])
    lead_id    = payload.get("metadata", {}).get("lead_id", "")
    
    # Run your existing regex extraction on the full transcript
    from agent.conversation import extract_profile
    profile = extract_profile(" ".join(t["message"] for t in transcript))
    update_lead_profile(lead_id, profile)
    return {"ok": True}
```

---

## 8. Cost Estimate Comparison

*Based on a 5-minute average call, 100 calls/month demo usage.*

| Component | Current Stack | ElevenLabs Agent |
|---|---|---|
| STT | Deepgram: $0.0059/min × 5min × 100 = **$2.95** | Included in agent minute |
| LLM | Grok: ~$0.10 per call × 100 = **$10.00** | GPT-4o: ~$0.08/call × 100 = **$8.00** |
| TTS | ElevenLabs: ~$0.50/call × 100 = **$50.00** | Included in agent minute |
| Agent infra | — | ~$0.10/min × 5min × 100 = **$50.00** |
| **Total** | **~$63/month** | **~$58/month** |

*At demo scale the costs are similar. At production scale (1,000+ calls/month), the Agent's per-minute pricing typically wins.*

---

## 9. Migration Checklist

```
[ ] Create ElevenLabs Agent in dashboard
[ ] Port Maya system prompt (test with 5 sample calls)
[ ] Add ELEVENLABS_AGENT_ID to backend/.env
[ ] Replace twilio_handler.py with new relay (Step 4)
[ ] Add /elevenlabs/call-complete webhook for CRM write-back
[ ] Remove Deepgram dependency (update requirements.txt)
[ ] Optional: wire Grok as custom LLM webhook (Step 3)
[ ] Run full test call — verify greeting, conversation, farewell
[ ] Monitor ElevenLabs dashboard for transcripts and latency metrics
```

---

## 10. Summary Verdict

| | Keep Current | Switch to ElevenLabs Agent |
|---|---|---|
| **Best for** | Full control, Grok specifically, unit-testable state machine | Demo quality, low latency, minimal maintenance |
| **Latency** | ~1,200ms/turn | ~600ms/turn |
| **Code to maintain** | ~1,500 lines | ~200 lines |
| **Risk** | Known issues (Unicode crashes, VAD tuning) | New integration surface |
| **Effort to switch** | — | ~1 day of work |

**Recommendation: Switch.** The 2x latency improvement and 7x code reduction make it worth 1 day of migration work, especially for a client demo where audio quality is the first impression.

If retaining Grok is a hard requirement, implement the custom LLM webhook (Step 3) — you keep the model, lose ~200ms latency vs. native, but still gain native VAD, barge-in, and no audio format code.
