# Proposed Twilio Integration Plan
### MantaRay AI — Maya Auto-Calls Customer After Enquiry Submission

---

## Goal

When a customer submits the Škoda enquiry form, Maya (the AI agent) automatically dials the customer's real phone number. The customer answers on their actual mobile and has a full voice conversation with Maya — no browser, no app required on the customer's end.

---

## Current Architecture (What Exists Today)

```
Customer browser
    │
    ├─ EnquiryPage.jsx  ──POST /api/leads──► FastAPI (main.py)
    │                                            │
    │                                            ├─ create_lead()
    │                                            ├─ broadcast_new_lead() → CRM WS
    │                                            └─ (nothing else — no call triggered)
    │
    └─ CallConsole.jsx  ──WS /ws/call-stream/{call_id}──► FastAPI
                                                              │
                                            ┌─────────────────┴──────────────────┐
                                            │        call_manager/manager.py      │
                                            │  initiate_call() → CallSession      │
                                            │  process_turn() → conversation.py   │
                                            └─────────────────┬──────────────────┘
                                                              │
                                            ┌─────────────────┴──────────────────┐
                                            │         agent/llm_client.py         │
                                            │  STT  → Deepgram Nova-2  (en-IN)    │
                                            │  BRAIN→ xAI Grok-3-fast (streaming) │
                                            │  TTS  → ElevenLabs Tara (eleven_v3) │
                                            └────────────────────────────────────┘
```

**Current call flow (simulated):**
1. CRM agent clicks "Call" in CallConsole → `POST /api/calls/initiate`
2. Browser mic captures audio → `POST /api/stt` → Deepgram → text
3. Text sent over WebSocket → Grok → ElevenLabs TTS → audio plays in browser
4. No real phone call happens — the "call" is entirely browser-based

---

## Target Architecture (With Twilio)

```
Customer browser                         Real Phone Network
    │                                           │
    └─ EnquiryPage.jsx                          │  ← Customer's actual mobile
         │                                      │
         POST /api/leads                        │
         │                                      │
         ▼                                      │
    FastAPI main.py                             │
         │                                      │
         ├─ create_lead()                       │
         ├─ broadcast_new_lead()                │
         └─ trigger_outbound_call(lead)         │
                  │                             │
                  ▼                             │
           Twilio REST API ────────────────────►│
           client.calls.create(                 │  Twilio dials customer
             to="+91 91234 56789",              │
             from_=TWILIO_NUMBER,               │
             url="https://<ngrok>/twilio/voice" │
           )                                    │
                  │                             │
                  │  TwiML webhook callback      │
                  ▼                             │
    FastAPI /twilio/voice  (TwiML response)     │
         │                                      │
         │  <Connect><Stream url="wss://..."/>  │
         │                                      │
         ▼                                      │
    FastAPI /ws/twilio-stream/{call_sid}        │
         │                        ▲             │
         │  mulaw 8kHz audio ─────┘             │  (Twilio bridges audio both ways)
         │                                      │
         │  PCM transcode                       │
         ▼                                      │
    Deepgram STT ──► Grok-3-fast ──► ElevenLabs TTS
                                          │
                                          │  PCM→mulaw transcode
                                          ▼
                                  Audio back to Twilio ──► Customer hears Maya
```

---

## What Twilio Products Are Needed

| Product | Purpose | Cost (approx) |
|---|---|---|
| **Twilio Programmable Voice** | Initiates the outbound call to customer | ~$0.013/min outbound India |
| **Twilio Media Streams** | Bidirectional raw audio WebSocket between Twilio and your server | Included with Voice |
| **Twilio Phone Number** | A caller ID that shows up on the customer's phone | ~$1/month |

No Twilio SDK for AI required — the existing STT/LLM/TTS pipeline is reused as-is.

---

## The One Non-Trivial Part — Audio Format Bridging

Twilio's audio format ≠ what Deepgram/ElevenLabs expect:

| | Format | Sample Rate | Encoding |
|---|---|---|---|
| **Twilio sends** | `audio/x-mulaw` | 8,000 Hz | µ-law (G.711) |
| **Deepgram expects** | `audio/wav` or `audio/webm` | ≥8,000 Hz | PCM |
| **ElevenLabs returns** | `audio/mpeg` (MP3) | 22,050–44,100 Hz | MP3 |
| **Twilio expects back** | `audio/x-mulaw` | 8,000 Hz | µ-law |

**Fix (Python stdlib, no extra deps):**

```python
import audioop, base64

# Twilio → Deepgram
def mulaw_to_pcm_wav(mulaw_bytes: bytes) -> bytes:
    pcm = audioop.ulaw2lin(mulaw_bytes, 2)          # µ-law → 16-bit PCM
    pcm = audioop.ratecv(pcm, 2, 1, 8000, 16000, None)[0]  # 8kHz → 16kHz
    # prepend WAV header → pass to deepgram_transcribe(..., "audio/wav")
    return _add_wav_header(pcm, sample_rate=16000)

# ElevenLabs MP3 → Twilio
def mp3_to_mulaw(mp3_bytes: bytes) -> bytes:
    import pydub                                    # only extra dep needed
    seg = pydub.AudioSegment.from_mp3(io.BytesIO(mp3_bytes))
    seg = seg.set_frame_rate(8000).set_channels(1).set_sample_width(2)
    pcm = seg.raw_data
    return audioop.lin2ulaw(pcm, 2)                 # PCM → µ-law
```

`pydub` is the only new dependency required for the MP3→µ-law conversion.

---

## Files to Change / Add

### New files

| File | What it does |
|---|---|
| `backend/twilio_handler.py` | TwiML webhook route + Media Streams WebSocket handler |
| `backend/audio_bridge.py` | `mulaw_to_pcm_wav()` and `mp3_to_mulaw()` converters |

### Modified files

| File | Change |
|---|---|
| `backend/main.py` | Import and mount `twilio_handler` router; add `trigger_outbound_call()` call inside `POST /api/leads` |
| `backend/.env` | Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PUBLIC_BASE_URL` |
| `backend/requirements.txt` | Add `twilio`, `pydub` |

**No changes needed to:**
- `agent/llm_client.py` — STT/LLM/TTS pipeline is reused exactly as-is
- `call_manager/manager.py` — session lifecycle logic is reused
- `agent/conversation.py` — conversation state machine is reused
- Any frontend file — the customer never uses the browser for the call

---

## Detailed Implementation Plan

### Step 1 — Twilio account setup (15 min, one-time)

1. Create account at [twilio.com](https://twilio.com)
2. Buy an Indian DID number (or a US/UK number — Twilio routes globally): Console → Phone Numbers → Buy
3. Note `ACCOUNT_SID` and `AUTH_TOKEN` from Console Dashboard
4. Install ngrok (or deploy to any public server) for the webhook URL

### Step 2 — `backend/audio_bridge.py` (new file, ~60 lines)

```python
import audioop, io, struct, wave
from typing import Optional

TWILIO_RATE   = 8_000   # Hz — fixed by Twilio
DEEPGRAM_RATE = 16_000  # Hz — Nova-2 performs best at 16kHz

def mulaw_to_wav(mulaw_bytes: bytes) -> bytes:
    """Twilio raw µ-law payload → WAV bytes ready for Deepgram."""
    pcm8k  = audioop.ulaw2lin(mulaw_bytes, 2)
    pcm16k = audioop.ratecv(pcm8k, 2, 1, TWILIO_RATE, DEEPGRAM_RATE, None)[0]
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(DEEPGRAM_RATE)
        wf.writeframes(pcm16k)
    return buf.getvalue()

def mp3_to_mulaw(mp3_bytes: bytes) -> bytes:
    """ElevenLabs MP3 → µ-law bytes for Twilio Media Streams."""
    import pydub
    seg = (pydub.AudioSegment
               .from_mp3(io.BytesIO(mp3_bytes))
               .set_frame_rate(TWILIO_RATE)
               .set_channels(1)
               .set_sample_width(2))
    return audioop.lin2ulaw(seg.raw_data, 2)
```

### Step 3 — `backend/twilio_handler.py` (new file, ~120 lines)

```python
from fastapi import APIRouter, WebSocket, Request
from fastapi.responses import Response
import json, asyncio, base64, os
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream

from call_manager.manager import initiate_call, end_call, get_session
from agent.llm_client    import deepgram_transcribe, tts
from agent.conversation  import process_customer_input
from audio_bridge        import mulaw_to_wav, mp3_to_mulaw

router = APIRouter()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")  # e.g. https://abc123.ngrok.io

@router.post("/twilio/voice")
async def twilio_voice_webhook(request: Request):
    """
    Twilio calls this URL when the outbound call is answered.
    Responds with TwiML that opens a Media Stream back to this server.
    """
    form = await request.form()
    call_sid = form.get("CallSid", "")
    lead_id  = form.get("StatusCallbackEvent") or \
               _sid_to_lead.get(call_sid, "")

    twiml = VoiceResponse()
    connect = Connect()
    connect.stream(
        url=f"wss://{PUBLIC_BASE_URL.replace('https://','')}/ws/twilio-stream/{call_sid}",
        name="MayaStream"
    )
    twiml.append(connect)
    return Response(content=str(twiml), media_type="application/xml")


@router.websocket("/ws/twilio-stream/{call_sid}")
async def twilio_media_stream(websocket: WebSocket, call_sid: str):
    """
    Bidirectional audio WebSocket with Twilio Media Streams.
    Receives µ-law audio from caller → Deepgram → Grok → ElevenLabs → µ-law back.
    """
    await websocket.accept()
    session = None
    audio_buffer = bytearray()

    try:
        async for raw in websocket.iter_text():
            msg = json.loads(raw)
            event = msg.get("event")

            if event == "connected":
                # Twilio handshake — nothing to do
                pass

            elif event == "start":
                # Twilio tells us which call SID and stream SID
                stream_sid = msg["start"]["streamSid"]
                lead_id    = _sid_to_lead.get(call_sid)
                if lead_id:
                    result  = initiate_call(lead_id)
                    session = get_session(result["call_id"])
                    # Send opening message as audio immediately
                    opening_audio = await tts(result["opening_message"])
                    if opening_audio:
                        mulaw = mp3_to_mulaw(opening_audio)
                        await _send_audio(websocket, stream_sid, mulaw)

            elif event == "media":
                # Accumulate audio chunks (Twilio sends 20ms frames)
                payload = base64.b64decode(msg["media"]["payload"])
                audio_buffer.extend(payload)
                # Process once we have ~400ms of audio (silence detection)
                if len(audio_buffer) >= 3200:  # 8000 Hz * 0.4s * 1 byte/sample
                    wav = mulaw_to_wav(bytes(audio_buffer))
                    audio_buffer.clear()
                    text = await deepgram_transcribe(wav, "audio/wav")
                    if text and session:
                        result = await process_customer_input(session, text)
                        agent_text = result.get("agent_text", "")
                        if agent_text:
                            audio = await tts(agent_text)
                            if audio:
                                mulaw = mp3_to_mulaw(audio)
                                await _send_audio(websocket, stream_sid, mulaw)

            elif event == "stop":
                if session:
                    end_call(session.call_id)
                break

    except Exception as e:
        print(f"[Twilio WS] Error: {e}")
    finally:
        await websocket.close()


async def _send_audio(ws: WebSocket, stream_sid: str, mulaw: bytes):
    """Wrap µ-law audio in Twilio Media Streams JSON envelope and send."""
    await ws.send_json({
        "event": "media",
        "streamSid": stream_sid,
        "media": {"payload": base64.b64encode(mulaw).decode()}
    })


# Maps Twilio CallSid → lead_id (populated when outbound call is triggered)
_sid_to_lead: dict[str, str] = {}

def register_call(call_sid: str, lead_id: str):
    _sid_to_lead[call_sid] = lead_id
```

### Step 4 — `backend/main.py` changes (~15 lines added)

```python
# Add to imports
from twilio.rest import Client as TwilioClient
from twilio_handler import router as twilio_router, register_call

TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN",  "")
TWILIO_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
PUBLIC_URL    = os.getenv("PUBLIC_BASE_URL",    "")

app.include_router(twilio_router)

# Replace the existing POST /api/leads handler body:
@app.post("/api/leads")
async def add_lead(payload: LeadCreate):
    lead_data = payload.model_dump()
    lead = create_lead(lead_data)
    await broadcast_new_lead(lead)

    # Auto-call if Twilio is configured and customer gave contact consent
    if TWILIO_SID and lead.get("contact_consent") and lead.get("phone"):
        try:
            client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
            call = client.calls.create(
                to=lead["phone"],
                from_=TWILIO_NUMBER,
                url=f"{PUBLIC_URL}/twilio/voice",
                status_callback=f"{PUBLIC_URL}/twilio/voice",
            )
            register_call(call.sid, lead["lead_id"])
            print(f"[Twilio] Outbound call initiated — SID={call.sid} to={lead['phone']}")
        except Exception as e:
            print(f"[Twilio] Call initiation failed: {e}")
            # Non-fatal — lead is still saved

    return {"success": True, "lead_id": lead["lead_id"], "lead": lead}
```

### Step 5 — Environment variables to add to `backend/.env`

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890
PUBLIC_BASE_URL=https://abc123.ngrok.io    # update each ngrok session
```

### Step 6 — New dependencies in `requirements.txt`

```
twilio>=9.0.0
pydub>=0.25.1
```

`pydub` requires `ffmpeg` installed system-wide (`choco install ffmpeg` on Windows).

---

## Audio Buffering Strategy

Twilio streams audio as 20ms frames continuously — there is no built-in "end of speech" signal. Two approaches:

| Strategy | How | Tradeoff |
|---|---|---|
| **Fixed buffer (simple)** | Accumulate N bytes, then transcribe | Can cut mid-word if caller pauses briefly |
| **VAD (Voice Activity Detection)** | Use Deepgram's live WebSocket streaming API instead of REST | Lower latency, smarter silence detection — extra complexity |

**Recommendation for PoC:** fixed 400ms buffer (as shown in the code above). Upgrade to Deepgram Live WebSocket later for production.

---

## Deepgram: REST vs Live WebSocket

The current app uses Deepgram's **REST API** (post a blob, get a transcript). For Twilio the better path is Deepgram's **Live WebSocket API** which accepts a continuous audio stream and fires transcripts in real time with proper end-of-utterance detection.

```
Twilio Media Streams WS  ──► Deepgram Live WS ──► text
        (µ-law 8kHz)                (send raw pcm)       (interim + final transcripts)
```

The REST approach works for PoC. The Live WebSocket approach is what production would use. Both use the same `DEEPGRAM_API_KEY`.

---

## What Does NOT Change

The entire conversation intelligence layer is completely unchanged:

- `agent/llm_client.py` — `deepgram_transcribe()`, `tts()`, `get_streaming_response_with_tts()` — called identically
- `agent/conversation.py` — `CallSession`, `process_customer_input()`, all state machine logic — no changes
- `call_manager/manager.py` — `initiate_call()`, `end_call()` — called identically
- `data/sample_leads.py` — CRM store — no changes
- All frontend files — customer never needs the browser

---

## Limitations & Risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Public URL required** | Twilio can't reach localhost; ngrok URL changes every session | Use ngrok paid plan (static domain) or deploy backend to Railway/Render |
| **Audio quality at 8kHz** | Twilio's PSTN audio is 8kHz µ-law — lower quality than browser WebRTC | Acceptable for voice calls; Deepgram Nova-2 handles 8kHz well |
| **Latency** | REST-based STT adds ~300ms per turn vs Live WebSocket | PoC acceptable; upgrade Deepgram to Live WS for production |
| **Regulatory** | India TRAI regulations require DND (Do Not Disturb) registry scrubbing before dialling | Check customer's number against DND registry; `contact_consent` flag already exists in `LeadCreate` |
| **Cost** | ~₹1.10/min outbound India via Twilio | Budget ~₹50–100 per demo session |
| **Call answer rate** | Unknown caller ID → many customers won't answer | Display branded caller ID via Twilio CNAM (available in US; India requires separate process) |

---

## Effort Estimate

| Task | Est. Time |
|---|---|
| Twilio account + number purchase | 30 min |
| `audio_bridge.py` (converter functions) | 2 hrs |
| `twilio_handler.py` (webhook + WS handler) | 4 hrs |
| `main.py` modifications | 1 hr |
| Testing (ngrok + Twilio trial account) | 2 hrs |
| Audio quality tuning (buffer size, VAD) | 2 hrs |
| **Total** | **~11 hrs** |

Upgrade to Deepgram Live WebSocket (for production-quality turn detection): additional ~4 hrs.

---

## Phased Approach

**Phase 1 — PoC (this plan):** REST Deepgram + fixed buffer + ngrok  
Proves the end-to-end flow works: form submit → real call → Maya speaks → customer responds → Maya replies.

**Phase 2 — Production ready:** Deepgram Live WebSocket + deployed server (not ngrok) + DND scrubbing + call recording via Twilio + CRM update on call completion.

**Phase 3 — Scale:** Replace Twilio PSTN with Twilio Programmable SIP or Exotel (India-local carrier, lower cost, better CNAM) + async call queue for high lead volume.
