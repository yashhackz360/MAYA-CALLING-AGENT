# Voice Agent Deep Dive — Maya (Škoda Auto India, v3.1 / Dealership Intelligence)

Complete internals of Maya — the AI voice agent that conducts real PSTN outbound calls for Škoda Auto India with city-specific dealership and inventory awareness.

---

## What Maya Is

Maya is a **real PSTN voice agent** that dials customers via Twilio, speaks through ElevenLabs (Tara voice), and drives a natural discovery conversation to qualify Škoda vehicle enquiries — entirely over a real phone call. From v3.1, Maya also speaks with **city-specific dealership and inventory awareness** via the Dealership Intelligence Layer.

| Service | Role |
|---|---|
| **Twilio** | Outbound PSTN calling — dials the customer's phone, streams bidirectional µ-law audio |
| **ElevenLabs Conversational Agent** | All-in-one hosted agent: STT + LLM + TTS |
| **ElevenLabs Tara voice** | `rfh7WrTVqLIjVSioJwdI` — TTS voice used for Maya |
| **xAI Grok-3** | Post-call transcript analysis — lead scoring, category, insights |
| **FastAPI** | Backend — relays audio, manages call state, saves logs, fires background tasks |
| **dealerships.py** | **[NEW]** City-aware dealer + inventory context builder |

---

## Maya's System Prompt (Current — v3.1)

Maya's persona is configured in the ElevenLabs dashboard system prompt. The prompt uses **14 dynamic `{{variables}}`** injected per-call by the backend:

### Variables Reference

| Variable | Source | Example Value |
|---|---|---|
| `{{customer_name}}` | lead.name | "Priya Sharma" |
| `{{vehicle_interest}}` | lead.preferences | "Škoda Kushaq Style" |
| `{{budget}}` | lead.preferences.budget | "₹16–18 Lakhs" |
| `{{transmission}}` | lead.preferences.transmission | "Automatic" |
| `{{location}}` | lead.preferences.location | "Bangalore" |
| `{{enquiry_type}}` | lead.preferences.enquiry_type | "New Purchase" |
| `{{purpose}}` | lead.preferences.purpose | "Family car" |
| `{{lead_tag}}` | lead.tag | "Hot" |
| `{{notes}}` | lead.preferences.notes | "[Returning customer] Wants sunroof..." |
| `{{dealer_info}}` | dealerships.py | "We have 3 Škoda showrooms in Bangalore. Top-rated: Škoda Whitefield — 4.8★." |
| `{{inventory_status}}` | dealerships.py | "Škoda Kushaq Style 1.5 TSI AT: 2 units left. Price: ₹17.49L." |
| `{{current_offers}}` | dealerships.py | "Exchange bonus ₹50,000 | Loyalty benefit ₹25,000" |
| `{{appointment_prompt}}` | dealerships.py | "I can book a test drive at Škoda Whitefield. Typical wait: 7 days." |
| `{{city_served}}` | dealerships.py | "Bangalore" |

### Prompt Design Principles

- **Brevity** — max 1–2 sentences, 10–20 words per turn, one question per turn
- **Language detection** — first exchange sets language (English / Hindi / Hinglish) for entire call
- **No re-collecting** — never ask for info already in the CUSTOMER BRIEF section
- **Dealer intelligence usage** — weave `dealer_info`, `inventory_status`, `current_offers` naturally, not verbatim
- **30-second silence rule** — "Are you there?" only after 30 full seconds of silence
- **Opener variety** — never open two replies with the same word
- **Goodbye sequence** — one-sentence summary → helpline if needed → farewell → `end_call` tool

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

Both paths call `register_call(call_sid, lead_id)` which stores the mapping in the module-level dict `_sid_to_lead: dict[str, str]`. When the WebSocket relay opens with a `call_sid`, it looks up the lead via this dict.

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
                        ├── LLM: configured in EL dashboard (14 {{variables}} injected)
                        └── TTS: Tara voice (rfh7WrTVqLIjVSioJwdI)
```

---

## Step-by-Step Call Lifecycle

### Step 1 — Twilio Webhook

```
Customer answers the outbound call
→ Twilio fires POST /twilio/voice
→ FastAPI reads form data: CallSid, CallStatus
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
  → get_lead(lead_id)  → read name, preferred_language, phone, preferences

  Wait for Twilio "start" event (asyncio.wait_for, 8s timeout):
    "connected" → log, continue waiting
    "start"     → stream_sid = msg["start"]["streamSid"]
```

### Step 3 — Connect to ElevenLabs

```python
el_ws_url = f"wss://api.elevenlabs.io/v1/convai/conversation?agent_id={el_agent_id}"
async with websockets.connect(el_ws_url,
    additional_headers={"xi-api-key": el_api_key},
    ping_interval=None,
    open_timeout=15,
) as el_ws:
```

### Step 4 — Receive Metadata

```
ElevenLabs sends: conversation_initiation_metadata
  → agent_output_audio_format: "pcm_16000" (default)
  → conversation_id: "conv_..."
```

### Step 5 — Send Per-Call Override + Dealership Intelligence

```python
# Build all 14 dynamic variables — includes Dealership Intelligence
dynamic_vars = _build_dynamic_variables(lead)

override = {
    "type": "conversation_initiation_client_data",
    "conversation_config_override": {
        "agent": {
            "first_message": "Hello Priya, this is Maya calling from Skoda Auto India.",
        },
        "tts": {"voice_id": "rfh7WrTVqLIjVSioJwdI"},
    },
    "dynamic_variables": dynamic_vars,  # ← 14 vars including 5 DI vars
}
await el_ws.send(json.dumps(override))
```

`_build_dynamic_variables(lead)` — how it builds the 5 DI variables:

```python
# Inside _build_dynamic_variables()
city         = prefs.get("location", "")
model        = prefs.get("vehicle_model", "")
variant      = prefs.get("variant", "")
transmission = prefs.get("transmission", "")

dealer_intel = build_dealer_intelligence(
    city=city,
    model=model,
    variant=variant,
    transmission=transmission,
)

# Returns dict with: dealer_info, inventory_status,
#                    current_offers, appointment_prompt, city_served
```

`build_dealer_intelligence()` calls these helpers in sequence:
1. `get_city_context(city)` — finds best-rated dealer, formats the dealer_info string
2. `get_inventory_context(model, variant, transmission)` — finds best matching variant, formats stock string
3. `get_offers_context(model)` — returns current_offers from INVENTORY
4. `get_dealer_appointment_context(city)` — formats appointment_prompt with wait days

### Step 6 — Bidirectional Relay

```python
await asyncio.gather(
    twilio_to_elevenlabs(),
    elevenlabs_to_twilio(),
    return_exceptions=True,
)
```

---

## Audio Transcoding — Full Detail

### Twilio → ElevenLabs (customer voice inbound)

```python
mulaw = base64.b64decode(msg["media"]["payload"])
pcm8k = audioop.ulaw2lin(mulaw, 2)
pcm16k, upsample_state = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, upsample_state)
pcm16k = audioop.mul(pcm16k, 2, 1.5)        # volume boost ×1.5

pcm_buf.extend(pcm16k)
packets += 1

if packets >= 3:  # BUFFER_PACKETS — ~60ms
    await el_ws.send(json.dumps({
        "user_audio_chunk": base64.b64encode(bytes(pcm_buf)).decode()
    }))
    pcm_buf.clear()
    packets = 0
```

### ElevenLabs → Twilio (Maya voice outbound)

```python
audio_b64 = (
    msg.get("audio_event", {}).get("audio_base_64")
    or msg.get("audio", {}).get("chunk", "")
)
raw_audio = base64.b64decode(audio_b64)

if output_fmt == "ulaw_8000":
    mulaw = raw_audio
elif output_fmt == "pcm_8000":
    mulaw = audioop.lin2ulaw(raw_audio, 2)
else:  # "pcm_16000" (default)
    if len(raw_audio) % 2 != 0:
        raw_audio = raw_audio[:-1]  # ensure even byte count
    pcm8k, downsample_state = audioop.ratecv(raw_audio, 2, 1, 16000, 8000, downsample_state)
    mulaw = audioop.lin2ulaw(pcm8k, 2)

await websocket.send_json({
    "event": "media",
    "streamSid": stream_sid,
    "media": {"payload": base64.b64encode(mulaw).decode()},
})
```

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
```

### Detection Flow

```
agent_response event received
  → _is_goodbye(text, preferred_language) → True
  → goodbye_detected = True
  → goodbye_audio_chunks = 0

subsequent audio events:
  → goodbye_audio_chunks += 1
  → if goodbye_audio_chunks >= 6:
       asyncio.ensure_future(_hangup_twilio_call(call_sid))
       break
```

6 audio chunks ≈ 120ms — enough for the farewell phrase to play fully before disconnect.

---

## Language-Aware Behaviour

```python
def _build_first_message(name: str, language: str) -> str:
    if language == "hindi":
        return f"Namaste {name} ji, main Maya bol rahi hoon Skoda Auto India se."
    return f"Hello {name}, this is Maya calling from Skoda Auto India."
```

`preferred_language` controls:
- **First message** — greeting language
- **Goodbye detection** — which phrase list to check
- **Full conversation** — governed by ElevenLabs system prompt language rules

---

## Post-Call Analysis Pipeline

```
Call ends → finally block:
  ├── add_call_log(log_entry)
  ├── add_call_to_lead(lead_id, {...})
  └── asyncio.ensure_future(_post_call_analysis(...))

_post_call_analysis (concurrent):
  ├── Task A: _fetch_recording_sid()  — polls Twilio × 5 (20s + 15s intervals)
  └── Task B: _analyze_transcript()  — xAI Grok-3 structured JSON

Results:
  → update_call_log(call_sid, {recording_sid, ai_analysis, outcome})
  → update_lead(lead_id, {tag, engagability, next_action, intent, ai_analysis})
```

---

## ElevenLabs Events — Full Reference

| Event `type` | Source | Action |
|---|---|---|
| `conversation_initiation_metadata` | EL → relay | Read `agent_output_audio_format`. Handled before relay loop. |
| `audio` | EL → relay | Transcode to µ-law, send to Twilio. Count goodbye chunks. |
| `agent_response` | EL → relay | Append to transcript. Check for goodbye phrase. |
| `user_transcript` | EL → relay | Append to transcript. Log customer's words. |
| `interruption` | EL → relay | Send `{"event": "clear", "streamSid": ...}` to Twilio (barge-in) |
| `ping` | EL → relay | Reply `{"type": "pong", "event_id": ...}` |
| `conversation_initiation_client_data` | relay → EL | Per-call override + 14 dynamic variables |
| `user_audio_chunk` | relay → EL | Customer audio in PCM 16kHz base64 |

---

## Barge-In Support

```python
elif t == "interruption":
    if stream_sid:
        await websocket.send_json({"event": "clear", "streamSid": stream_sid})
```

`clear` flushes Twilio's audio buffer — stops Maya's voice instantly so the customer's interjection is processed.

---

## Logging Strategy

```
[Webhook]  POST /twilio/voice — CallSid=CA... Status=in-progress
[WS]       Accepted — call_sid=CA...
[WS]       Twilio 'start' — streamSid=MZ...
[EL]       Connecting — agent=... lang=english
[EL]       output_fmt=pcm_16000  conv_id=conv_...
[EL]       Sent override — customer=Priya lang=english voice=rfh7...
[EL]       MAYA said: 'Hello Priya, this is Maya calling from Skoda...'
[EL]       CUSTOMER said: 'Hi yes, I'm interested.'
[EL]       MAYA said: '...have a great day!'
[EL]       Goodbye phrase detected — will hang up after audio
[EL->T]    Goodbye audio delivered — hanging up call
[Hangup]   Call CA... ended via Twilio REST API
[WS]       Call log saved — lead=lead_001 duration=2:14 turns=12
[PostCall] Starting for call=CA... lead=lead_001 turns=12
[Recording]Found SID=RE... for call=CA... (attempt 2)
[Analysis] Grok returned: category=Hot engagability=Very High
[PostCall] Lead lead_001 updated — tag=Hot
```

---

## What This System Does NOT Do

- **No browser audio** — no MediaRecorder, no WebRTC, no browser microphone usage
- **No browser call simulation** — Path B (xAI / Deepgram / CallConsole) fully removed
- **No persistent database** — in-memory Python dicts reset on server restart
- **No streaming STT** — ElevenLabs handles all STT internally
- **No live inventory API** — dealerships.py is a static mock dataset
- **No call recording in-app** — Twilio stores recordings; the app only saves the recording SID
- **No multi-tenancy or RBAC** — demo credentials only (admin/admin123, demo/demo123, manager/manager123)
- **No real-time transcript streaming to dashboard** — transcript saved only at call end
