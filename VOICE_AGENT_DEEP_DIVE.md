# Voice Agent Deep Dive — Maya (Škoda Customer Care, v4)

## What Maya Is

Maya is a browser-based AI calling agent that conducts customer care calls for Škoda Auto India in formal Indian English. She speaks via ElevenLabs TTS (Tara voice) or xAI TTS (eve voice), listens via xAI grok-stt (server-side), and drives the conversation through a 5-state machine backed by xAI grok-3-fast.

**One API key (XAI_API_KEY) powers three things:** LLM (grok-3-fast), TTS (xAI /v1/tts, eve), STT (xAI grok-stt).

---

## Voice Output — Text-to-Speech

### TTS Priority Chain

```
1. ElevenLabs API  (Tara voice, eleven_flash_v2_5)  — if ELEVENLABS_API_KEY set
2. xAI TTS API     (/v1/tts, voice: eve)             — if XAI_API_KEY set
3. Browser SpeechSynthesis                           — always available as fallback
```

### ElevenLabs Tara (Primary)
- Voice ID: `rfh7WrTVqLIjVSioJwdI`
- Model: `eleven_flash_v2_5` (lowest latency)
- Returns: base64-encoded MP3, played via `<audio>` element in browser

### xAI TTS (Secondary)
- Endpoint: `POST https://api.x.ai/v1/tts`
- Voice: `eve` — clear, professional female voice
- Returns: base64-encoded audio

### Browser SpeechSynthesis (Fallback)
- Rate: `0.88` — measured Indian English cadence
- Pitch: `1.05` — grounded, professional
- Lang: `en-IN`
- Voice priority: Google UK English Female → Microsoft Zira → Aria → Samantha

### TTS Text Preprocessing (`humanize_for_speech`)

Before text reaches any TTS engine:

| Input | Output | Reason |
|---|---|---|
| `₹16L` | `rupees 16 lakh` | TTS engines mispronounce ₹ |
| `DSG` | `D S G` | Acronym — letter by letter |
| `TSI` | `T S I` | Acronym |
| `1.5 TSI` | `1.5 T S I` | Inline acronym |
| `**bold**` | `bold` | Strip markdown |
| `- bullet` | `bullet` | Strip list formatting |
| `Maya: ...` | `...` | Strip echoed speaker prefix |

### End-Call Audio Fix
`endCall()` in `CallConsole.jsx` waits **8 seconds** after playing the closing message before transitioning the UI — ensuring the TTS voice finishes fully before the call screen changes.

---

## Voice Input — Speech-to-Text

### STT Architecture (as of v4)

```
Browser records mic audio (MediaRecorder API)
  -> Silence detected (AudioContext analyser, 1.2s threshold)
  -> Audio chunks POSTed to backend /api/stt (multipart/form-data)
  -> Backend sends to xAI grok-stt (POST https://api.x.ai/v1/stt, model=grok-stt)
  -> Returns transcript text
  -> Frontend fires handleSpeechResult(text)
  -> Fallback: browser Web Speech API (webkitSpeechRecognition) if xAI fails
```

### xAI grok-stt
- **Endpoint:** `POST https://api.x.ai/v1/stt`
- **Model:** `grok-stt`
- **Auth:** Same `XAI_API_KEY` — no separate key needed
- **Pricing:** $0.10/hour (batch)
- **Formats:** WAV, MP3, OGG, WebM, FLAC, MP4, M4A
- **Languages:** 25+ including English, Hindi

### Silence Detection

```javascript
SILENCE_DURATION = 1200ms  // stop recording after 1.2s of silence
MIN_SPEECH_MS    = 300ms   // discard if recording was under 300ms
```

The AudioContext analyser measures RMS amplitude every 100ms. When it drops below threshold for `SILENCE_DURATION`, the MediaRecorder stops and the audio is POSTed to `/api/stt`.

### The 1.8-Second Post-TTS Cooldown

After Maya finishes speaking, the microphone waits 1800ms before restarting:

```javascript
setTimeout(() => {
  if (!isActiveRef.current && autoListen && !agentSpeakingRef.current &&
      !isProcessingRef.current && !callEnded) {
    startListening()
  }
}, 1800)
```

Prevents STT from catching Maya's voice tail or ambient noise right after she stops.

### STT Noise Filter

Auto-listen inputs shorter than 2 words AND fewer than 6 characters are discarded:

```javascript
if (isAutoInput && inputText.split(' ').length < 2 && inputText.length < 6) {
  // Discard — single syllable, mic bleed
  isProcessingRef.current = false; return
}
```

Manual button-click inputs always go through.

---

## Conversation Engine

### 5-State Machine

```
NAME_CONFIRM -> GREETING -> DISCOVERY -> ENDED
                    \-> ESCALATED
```

### 2-Turn Opening

The call opening is split into exactly 2 turns:

```
Turn 1 (NAME_CONFIRM) — hardcoded, instant, ~10 words:
  "Hello Priya, this is Maya calling from Škoda Auto India."

Turn 2 (GREETING) — hardcoded, instant, ~30 words:
  "I am calling regarding your recent enquiry about the Škoda Kushaq,
   new purchase, Style variant. Please note, this call may be recorded
   for training and quality purposes. Do you have a couple of minutes, Priya?"
```

Both turns are **hardcoded strings** — no LLM call, zero lag. LLM takes over from Turn 3 (DISCOVERY).

### Why 2 turns, not 1?

The original single-chunk opening was 60+ words. Customers would answer the name check and miss the availability question, causing the agent to skip directly to discovery. The 2-turn split enforces proper conversational rhythm.

### xAI grok-3-fast Backend

```
Every DISCOVERY turn:
  1. xAI grok-3-fast (chat completions, max_tokens=80)
       -> if error -> rule-based fallback
  2. Rule-based keyword engine
       -> always succeeds
```

**Why grok-3-fast?** Lower latency than grok-3 (~0.5–1.5s vs ~2–4s) with equivalent quality for short conversational responses.

### Indian English Persona (System Prompt)

Maya's system prompt explicitly governs tone:

**USE:**
- "Sure", "Right", "Noted", "Okay"
- "May I know", "Kindly", "Shall I arrange"
- "Absolutely", "Very good", "That's nice"

**NEVER SAY:**
- "I'm glad to hear that", "Thanks for confirming", "I'd love to assist"
- "Great choice", "Perfect", "Awesome"

**Response rules:**
- Max 2 SHORT sentences per turn (≤25 words total)
- One question per turn only
- No bullet points, no markdown, no emojis
- Never start two consecutive sentences with "I"

### In-Memory Profile Updates

Every customer turn updates the lead profile before the LLM is called:

```python
# Customer: "I want the Kushaq automatic, budget around 16 lakhs"
# Before LLM call:
lead["preferences"]["vehicle_model"]  = "Škoda Kushaq"
lead["preferences"]["transmission"]   = "Automatic"
lead["preferences"]["budget"]         = "Rs.16 lakh"

# LLM prompt now includes enriched profile → Maya skips those questions
```

---

## Proactive Guards

| Trigger | Detection | Maya's Response |
|---|---|---|
| "busy", "driving", "cut the call" | Keyword match any turn | Graceful end — calls back later |
| "speak to a human", "escalate" | Keyword match | Escalation — senior executive |
| "bye", "thank you", "that's all" | Keyword match | Summary + farewell |
| Wrong number | "wrong number", "not me" | Apology + end call |
| Empty STT input | `user_input == ""` | "I am sorry, I did not catch that." |
| <2-word input (noise) in DISCOVERY | word_count < 2 | "Could you say that a bit more clearly?" (max 2 retries) |
| 3+ consecutive blank inputs | `_repeat_count >= 3` | "I hope we are still connected. Shall we continue?" |

---

## Browser Requirements

| Requirement | Details |
|---|---|
| **Browser** | Chrome 90+ or Edge 90+ (MediaRecorder + AudioContext required for Groq STT) |
| **OS** | Desktop preferred |
| **Microphone** | Permission must be granted on first use |
| **Protocol** | HTTPS required in production (mic blocked on HTTP, except localhost) |
| **Internet** | Required for xAI API (LLM + TTS + STT) and ElevenLabs |

---

## What This System Does NOT Do

- **No real telephony** — browser simulation only (no Twilio/SIP/PSTN)
- **No persistent database** — in-memory Python dicts
- **No authentication or multi-tenancy**
- **No call recording** — transcript text only
- **No streaming STT** — batch mode (audio recorded then sent)
