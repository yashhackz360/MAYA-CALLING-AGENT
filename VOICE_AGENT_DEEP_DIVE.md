# Voice Agent Deep Dive — Maya (Škoda Auto India, v3 / Path A)

Complete internals of Maya — the AI voice agent that conducts real PSTN outbound calls for Škoda Auto India.

---

## What Maya Is

Maya is a **real PSTN voice agent** that dials customers via Twilio, speaks through ElevenLabs (Tara voice), and drives a natural discovery conversation to qualify Škoda vehicle enquiries — entirely over a real phone call. There is **no browser simulation** — the call goes to the customer's actual mobile or landline number.

| Service | Role |
|---|---|
| **Twilio** | Outbound PSTN calling — dials the customer's phone, streams bidirectional µ-law audio |
| **ElevenLabs Conversational Agent** | All-in-one hosted agent: STT + LLM + TTS |
| **ElevenLabs Tara voice** | `rfh7WrTVqLIjVSioJwdI` — TTS voice used for Maya |
| **xAI Grok-3** | Post-call transcript analysis — lead scoring, category, insights |
| **FastAPI** | Backend — relays audio, manages call state, saves logs, fires background tasks |

---

## Call Initiation

A call can be triggered two ways:

### 1. Auto-dial on Lead Creation

```
POST /api/leads (from EnquiryPage or manual add)
  → lead created (or merged if duplicate)
  → if TWILIO_ACCOUNT_SID set AND lead.contact_consent == True:
       twilio.calls.create(
           to=lead["phone"],
           from_=TWILIO_FROM_NUMBER,
           url=f"{PUBLIC_BASE_URL}/twilio/voice",
           record=True
       )
       register_call(call.sid, lead["lead_id"])
```

### 2. Manual Trigger from Dashboard

```
POST /api/leads/{id}/call
  → get_lead(id) from store
  → twilio.calls.create(to=phone, from_=TWILIO_NUMBER, url=.../twilio/voice, record=True)
  → register_call(call.sid, lead_id)
```

Both paths call `register_call(call_sid, lead_id)` which stores the mapping in the module-level dict `_sid_to_lead: dict[str, str]`. When the WebSocket relay opens with a `call_sid`, it looks up the lead via this dict to read `name`, `preferred_language`, and `phone`.

---

## Audio Relay Architecture (`twilio_handler.py`)

```
Customer Phone (real PSTN)
    │  (Twilio outbound call)
    ▼
Twilio Media Stream WebSocket
    │  µ-law 8kHz audio, base64-encoded, ~20ms packets
    ▼
FastAPI  /ws/twilio-stream/{call_sid}
    │  asyncio.gather() — bidirectional relay
    ├── twilio_to_elevenlabs()  ────────────────►  ElevenLabs WS
    └── elevenlabs_to_twilio()  ◄────────────────  ElevenLabs WS
                                         │
                        wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...
                                         │
                        ElevenLabs Conversational Agent
                        ├── STT: built-in (processes PCM 16kHz)
                        ├── LLM: configured in EL dashboard (Škoda Maya persona)
                        └── TTS: Tara voice (rfh7WrTVqLIjVSioJwdI)
```

---

## Step-by-Step Call Lifecycle

### Step 1 — Twilio Webhook

```
Customer answers the outbound call
→ Twilio fires POST /twilio/voice
→ FastAPI reads form data: CallSid, CallStatus
→ Constructs WebSocket URL: wss://{PUBLIC_BASE_URL}/ws/twilio-stream/{CallSid}
→ Returns TwiML:
    <Response>
      <Connect>
        <Stream url="wss://abc.ngrok-free.app/ws/twilio-stream/CA..."/>
      </Connect>
    </Response>
```

### Step 2 — WebSocket Opens

```
/ws/twilio-stream/{call_sid}
  → await websocket.accept()
  → lead_id = _sid_to_lead.get(call_sid, "unknown")
  → get_lead(lead_id)  → read customer_name, preferred_language, phone
  → Log: [WS] Accepted — call_sid=CA...

  Wait for Twilio "start" event (asyncio.wait_for, 8s timeout):
    "connected" event → log, continue waiting
    "start"     event → stream_sid = msg["start"]["streamSid"]
                        (must capture BEFORE connecting to ElevenLabs)
```

The `stream_sid` is different from `call_sid`. It is required for sending audio back to Twilio. Waiting for "start" before connecting ElevenLabs prevents a race where ElevenLabs starts speaking before `stream_sid` is available.

### Step 3 — Connect to ElevenLabs

```python
el_ws_url = f"wss://api.elevenlabs.io/v1/convai/conversation?agent_id={el_agent_id}"

async with websockets.connect(
    el_ws_url,
    additional_headers={"xi-api-key": el_api_key},
    ping_interval=None,
    open_timeout=15,
) as el_ws:
```

`ping_interval=None` disables websockets library's built-in ping, allowing ElevenLabs' own ping/pong protocol to manage the connection.

### Step 4 — Receive Metadata

```
ElevenLabs sends: conversation_initiation_metadata
  → agent_output_audio_format: "pcm_16000" (default)
  → conversation_id: "conv_..."
  
output_fmt is stored — determines which transcoding path to use for outbound audio
```

### Step 5 — Send Per-Call Override

```python
override = {
    "type": "conversation_initiation_client_data",
    "conversation_config_override": {
        "agent": {
            "first_message": "Hello Priya, this is Maya calling from Skoda Auto India.",
        },
        "tts": {"voice_id": "rfh7WrTVqLIjVSioJwdI"},
    },
}
await el_ws.send(json.dumps(override))
```

This overrides the EL dashboard defaults for every call — ensuring the correct name, language, and voice are used.

### Step 6 — Bidirectional Relay

```python
await asyncio.gather(
    twilio_to_elevenlabs(),
    elevenlabs_to_twilio(),
    return_exceptions=True,
)
```

Both coroutines run concurrently on the same event loop. They share state via `nonlocal` variables:
- `twilio_pkt_count`, `el_send_count`, `el_audio_count` — packet counters for logging
- `goodbye_detected` — set by `elevenlabs_to_twilio` when goodbye phrase found

---

## Audio Transcoding — Full Detail

### Twilio → ElevenLabs (customer voice inbound)

```python
# From twilio_to_elevenlabs() coroutine

mulaw = base64.b64decode(msg["media"]["payload"])
# mulaw: raw µ-law bytes at 8kHz (8-bit logarithmic companded encoding)

pcm8k = audioop.ulaw2lin(mulaw, 2)
# pcm8k: 16-bit PCM at 8kHz (2 bytes per sample, little-endian)

pcm16k, upsample_state = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, upsample_state)
# pcm16k: 16-bit PCM at 16kHz (ElevenLabs STT expects 16kHz)
# upsample_state: resampler state preserved across packets for clean upsampling

pcm16k = audioop.mul(pcm16k, 2, 1.5)
# volume boost ×1.5 — makes the customer's voice clearer for STT

pcm_buf.extend(pcm16k)
packets += 1

if packets >= 3:  # BUFFER_PACKETS
    await el_ws.send(json.dumps({
        "user_audio_chunk": base64.b64encode(bytes(pcm_buf)).decode()
    }))
    pcm_buf.clear()
    packets = 0
```

**Why µ-law?** Twilio MediaStream uses G.711 µ-law encoding — the standard PSTN audio codec. It compresses 16-bit PCM into 8-bit logarithmic scale, reducing bandwidth while preserving voice frequency range.

**Why 3-packet buffer?** Each Twilio packet is ~20ms. Three packets = ~60ms of audio per EL message. This reduces WebSocket frame overhead and ensures EL receives substantial frames for STT processing.

### ElevenLabs → Twilio (Maya voice outbound)

```python
# From elevenlabs_to_twilio() coroutine

audio_b64 = (
    msg.get("audio_event", {}).get("audio_base_64")
    or msg.get("audio", {}).get("chunk", "")
)
raw_audio = base64.b64decode(audio_b64)

# Format-conditional transcoding based on output_fmt from metadata:
if output_fmt == "ulaw_8000":
    mulaw = raw_audio  # already µ-law, use directly

elif output_fmt == "pcm_8000":
    mulaw = audioop.lin2ulaw(raw_audio, 2)

else:  # "pcm_16000" (default)
    if len(raw_audio) % 2 != 0:
        raw_audio = raw_audio[:-1]  # ensure even byte count for 16-bit samples
    pcm8k, downsample_state = audioop.ratecv(
        raw_audio, 2, 1, 16000, 8000, downsample_state
    )
    mulaw = audioop.lin2ulaw(pcm8k, 2)

await websocket.send_json({
    "event":     "media",
    "streamSid": stream_sid,
    "media":     {"payload": base64.b64encode(mulaw).decode()},
})
```

**Why two audio field names?** ElevenLabs changed their WebSocket protocol between versions. The handler supports both `audio_event.audio_base_64` (older) and `audio.chunk` (newer) to maintain compatibility.

**Why odd-byte trimming?** The `audioop` functions require an even number of bytes for 16-bit (2-byte) samples. ElevenLabs occasionally sends slightly misaligned chunks.

---

## Goodbye Detection

### Phrase Lists

```python
_GOODBYE_EN = [
    "thank you for contacting skoda",
    "have a great day",
    "have a good day",
    "thank you and goodbye",
]

_GOODBYE_HI = [
    "dhanyavaad",
    "aapka din shubh",
    "aapka din acha",
    "shukriya skoda",
    "skoda se sampark karne ke liye",
]

def _is_goodbye(text: str, language: str) -> bool:
    phrases = _GOODBYE_HI if language == "hindi" else _GOODBYE_EN
    return any(p in text.lower() for p in phrases)
```

Language is read from `lead["preferred_language"]` at the start of the relay session. Hinglish leads use English phrases (Maya code-switches, goodbye in English).

### Detection Flow

```
agent_response event received
  → text extracted from msg["agent_response_event"]["agent_response"]
  → logged to transcript: {"role": "agent", "text": text}
  → if not goodbye_detected:
       if _is_goodbye(text, preferred_language):
           goodbye_detected = True
           goodbye_audio_chunks = 0
           log: "[EL] Goodbye phrase detected — will hang up after audio"

  subsequent audio events (while goodbye_detected == True):
    → goodbye_audio_chunks += 1
    → if goodbye_audio_chunks >= 6:
         asyncio.ensure_future(_hangup_twilio_call(call_sid))
         break  ← exits elevenlabs_to_twilio loop
```

**Why 6 audio chunks?** Each audio event is approximately 20ms. Six chunks ≈ 120ms — enough for Maya's farewell audio ("Have a great day!") to fully play through the customer's phone before the call disconnects.

### Twilio Hangup

```python
async def _hangup_twilio_call(call_sid: str) -> None:
    client = Client(twilio_sid, twilio_token)
    await loop.run_in_executor(
        None,
        lambda: client.calls(call_sid).update(status="completed")
    )
```

`run_in_executor` is used because the Twilio SDK is synchronous. Running it in an executor thread prevents blocking the asyncio event loop.

---

## Language-Aware Behaviour

```python
def _build_first_message(name: str, language: str) -> str:
    if language == "hindi":
        return f"Namaste {name} ji, main Maya bol rahi hoon Skoda Auto India se."
    return f"Hello {name}, this is Maya calling from Skoda Auto India."
```

The `preferred_language` field from the lead record controls:
- **First message** — greeting language (English vs Hindi)
- **Goodbye detection** — which phrase list to check
- **ElevenLabs system prompt context** — the full conversation language behavior is governed by the Škoda persona system prompt configured in the EL dashboard

---

## Post-Call Analysis Pipeline

```
Call ends (Twilio "stop" event OR goodbye detected OR WebSocket closed)
  │
  ▼
finally block runs (always):
  ├── Calculate duration: int(time.time() - call_start) → "2:14"
  ├── add_call_log(log_entry)  → _call_logs.append(entry)
  ├── add_call_to_lead(lead_id, {...})  → lead["call_history"].append(record)
  └── asyncio.ensure_future(_post_call_analysis(call_sid, lead_id, transcript, customer_name))

_post_call_analysis (background, concurrent):
  ├── Task A: _fetch_recording_sid(call_sid)
  │     Poll Twilio recordings.list() × 5 attempts (20s + 15s intervals)
  │     → recordings[0].sid once available
  │
  └── Task B: _analyze_transcript(transcript, customer_name)
        Send to xAI Grok-3 (if XAI_API_KEY set)
        → structured JSON: engagability, category, worth_pursuing,
          purchase_intent, conclusion, key_insights, next_action

  Results:
    → update_call_log(call_sid, {recording_sid, ai_analysis, outcome})
    → update_lead(lead_id, {tag, engagability, next_action, intent, ai_analysis})
```

### xAI Grok-3 Transcript Prompt

The prompt is structured to extract seven fields with explicit classification criteria:

- **Hot** — ready to buy, test drive booked, strong purchase intent
- **Warm** — interested but comparing options or needs follow-up
- **Cold** — not interested, wrong timing, browsing only, did not engage
- **Engagability** — how responsive and cooperative the customer was
- **worth_pursuing** — `true` if any realistic chance of conversion remains

The response is parsed as JSON. If Grok wraps the response in markdown code fences (```json), the fences are stripped before parsing.

---

## ElevenLabs Events — Full Reference

| Event `type` | Source | Action in Handler |
|---|---|---|
| `conversation_initiation_metadata` | EL → relay | Read `agent_output_audio_format`. Handled before relay loop. |
| `audio` | EL → relay | Transcode to µ-law, send to Twilio. Count goodbye chunks. |
| `agent_response` | EL → relay | Append to transcript. Check for goodbye phrase. Log Maya's speech. |
| `user_transcript` | EL → relay | Append to transcript. Log customer's words. |
| `interruption` | EL → relay | Send `{"event": "clear", "streamSid": ...}` to Twilio (flush buffered audio — barge-in) |
| `ping` | EL → relay | Optional delay if `ping_ms > 0`. Reply with `{"type": "pong", "event_id": ...}` |
| `conversation_initiation_client_data` | relay → EL | Sent once after metadata. Per-call config override. |
| `user_audio_chunk` | relay → EL | Customer audio in PCM 16kHz base64. Sent from `twilio_to_elevenlabs`. |

---

## Barge-In Support

When a customer starts speaking while Maya is still talking, ElevenLabs sends an `interruption` event:

```python
elif t == "interruption":
    if stream_sid:
        await websocket.send_json({"event": "clear", "streamSid": stream_sid})
    log.info("[EL] Interruption (barge-in)")
```

The `clear` event tells Twilio to flush all buffered audio immediately — stopping Maya's voice on the customer's phone. ElevenLabs then processes the customer's interjection via STT and resumes the conversation.

---

## Transcript Format

The `transcript` list is built during the relay and saved to the call log:

```python
# Agent speech
transcript.append({"role": "agent", "text": "Hello Priya, this is Maya..."})

# Customer speech
transcript.append({"role": "customer", "text": "Yes, I'm interested in the Kushaq."})
```

This list is passed to xAI Grok for analysis and stored in the call log under `"transcript"`.

---

## Logging Strategy

All relay activity writes to `backend/twilio_relay.log`:

```
2026-05-06 10:23:01 [Webhook] POST /twilio/voice — CallSid=CA123 Status=in-progress
2026-05-06 10:23:01 [Webhook] Stream URL: wss://abc.ngrok-free.app/ws/twilio-stream/CA123
2026-05-06 10:23:02 [WS] Accepted — call_sid=CA123
2026-05-06 10:23:02 [WS] Waiting for Twilio 'start' event…
2026-05-06 10:23:02 [WS] Twilio 'start' — streamSid=MZ456
2026-05-06 10:23:02 [EL] Connecting — agent=agent_01abc... lang=english
2026-05-06 10:23:03 [EL] Connected
2026-05-06 10:23:03 [EL] Metadata: {"type": "conversation_initiation_metadata", ...}
2026-05-06 10:23:03 [EL] output_fmt=pcm_16000  conv_id=conv_789
2026-05-06 10:23:03 [EL] Sent override — customer=Priya lang=english voice=rfh7...
2026-05-06 10:23:05 [EL] MAYA said: 'Hello Priya, this is Maya calling from Skoda...'
2026-05-06 10:23:08 [EL] CUSTOMER said: 'Hi yes, I'm interested.'
2026-05-06 10:23:45 [EL] MAYA said: '...have a great day!'
2026-05-06 10:23:45 [EL] Goodbye phrase detected — will hang up after audio
2026-05-06 10:23:46 [EL->T] Goodbye audio delivered — hanging up call
2026-05-06 10:23:46 [Hangup] Call CA123 ended via Twilio REST API
2026-05-06 10:23:46 [WS] Call log saved — lead=lead_001 duration=2:14 turns=12
2026-05-06 10:23:46 [WS] Post-call analysis queued for CA123
2026-05-06 10:24:06 [PostCall] Starting for call=CA123 lead=lead_001 turns=12
2026-05-06 10:25:46 [Recording] Found SID=RE789 for call=CA123 (attempt 2)
2026-05-06 10:24:07 [Analysis] Grok returned: category=Hot engagability=Very High
2026-05-06 10:24:07 [PostCall] Lead lead_001 updated — tag=Hot engagability=Very High
```

---

## What This System Does NOT Do

- **No browser audio** — no MediaRecorder, no WebRTC, no browser microphone usage
- **No browser call simulation** — Path B (xAI / Deepgram / CallConsole) fully removed
- **No persistent database** — in-memory Python dicts reset on server restart
- **No streaming STT** — ElevenLabs handles all STT internally inside the Conversational Agent
- **No call recording in-app** — Twilio stores recordings; the app only saves the recording SID
- **No multi-tenancy or RBAC** — demo credentials only (admin/admin123, demo/demo123, manager/manager123)
- **No real-time transcript streaming to dashboard** — transcript is collected during the call and saved only at call end
