"""
LLM Client — near-zero-latency voice pipeline.

  STT   → Deepgram Nova-2  (Indian English, detect_language for Hindi/Hinglish)
  BRAIN → xAI Grok-3-fast  (tuned for minimal TTFT: 55 tokens, no penalties)
  TTS   → ElevenLabs Tara  (Indian accent voice settings, eleven_v3)
"""

import os
import re
import json
import asyncio
import base64
import httpx
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from agent.conversation import CallSession

# ─── Deepgram STT ─────────────────────────────────────────────────────────────

_deepgram_api_key: Optional[str] = None
DEEPGRAM_STT_URL  = "https://api.deepgram.com/v1/listen"
DEEPGRAM_MODEL    = "nova-2"

# ─── xAI Brain ────────────────────────────────────────────────────────────────

_xai_api_key: Optional[str] = None
_active_backend: Optional[str] = None

XAI_REALTIME_URL  = "wss://api.x.ai/v1/realtime"
XAI_TTS_URL       = "https://api.x.ai/v1/tts"
XAI_VOICE         = "ara"
XAI_SAMPLE_RATE   = 24000
XAI_MODEL         = "grok-3-fast"

# ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

_elevenlabs_api_key: Optional[str] = None

ELEVENLABS_VOICE_ID = "rfh7WrTVqLIjVSioJwdI"   # Tara — Warm & Aggressive (sales/negotiation)
ELEVENLABS_MODEL    = "eleven_v3"                # v3 — highest quality, best prosody
ELEVENLABS_TTS_URL  = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

# ─── Shared httpx client — connection pooling slashes per-request latency ─────
_http_client = None

# ElevenLabs plan allows max 3 concurrent requests.
# Cap at 2 so the 3rd slot is never stolen by a burst — prevents 429 fallback to xAI TTS.
_elevenlabs_semaphore = asyncio.Semaphore(2)


def _get_http_client():
    global _http_client
    if _http_client is None:
        import httpx
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _http_client


def _init_deepgram() -> bool:
    global _deepgram_api_key
    api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if not api_key:
        return False
    _deepgram_api_key = api_key
    print(f"[STT] OK  Deepgram ready (model: {DEEPGRAM_MODEL}, lang: en-IN, key: ...{api_key[-6:]})")
    return True


def _init_xai() -> bool:
    global _xai_api_key, _active_backend
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        return False
    _xai_api_key = api_key
    _active_backend = "xai"
    print(f"[LLM] OK  xAI Grok ready (model: {XAI_MODEL}, key: ...{api_key[-6:]})")
    return True


def _init_elevenlabs() -> bool:
    global _elevenlabs_api_key
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        return False
    _elevenlabs_api_key = api_key
    print(f"[TTS] OK  ElevenLabs ready (voice: Tara/{ELEVENLABS_VOICE_ID}, model: {ELEVENLABS_MODEL}, key: ...{api_key[-6:]})")
    return True


def init_llm_backend():
    _init_deepgram()
    _init_elevenlabs()
    if not _init_xai():
        print("[LLM] ERR No XAI_API_KEY — rule-based fallback active")


def get_deepgram_api_key() -> Optional[str]:
    return _deepgram_api_key


def get_xai_api_key() -> Optional[str]:
    return _xai_api_key


def get_active_backend() -> str:
    return _active_backend or "fallback"


# ─── Deepgram STT ─────────────────────────────────────────────────────────────

async def deepgram_transcribe(audio_bytes: bytes, content_type: str = "audio/webm") -> Optional[str]:
    """Transcribe audio via Deepgram Nova-2 — Indian English + Hindi/Hinglish detection."""
    if not _deepgram_api_key:
        return None
    client = _get_http_client()
    response = await client.post(
        DEEPGRAM_STT_URL,
        params={
            "model":           DEEPGRAM_MODEL,
            "language":        "en-IN",
            "smart_format":    "true",
            "punctuate":       "true",
            "detect_language": "true",
            "filler_words":    "false",
        },
        headers={
            "Authorization": f"Token {_deepgram_api_key}",
            "Content-Type":  content_type,
        },
        content=audio_bytes,
        timeout=httpx.Timeout(8.0, connect=4.0),
    )
    if response.status_code == 200:
        try:
            text = response.json()["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
            if text:
                print(f"[Deepgram] Transcript: \"{text[:80]}\"")
            return text or None
        except (KeyError, IndexError):
            print("[Deepgram] ERR Unexpected response structure")
            return None
    print(f"[Deepgram] ERR {response.status_code}: {response.text[:200]}")
    return None


# ─── Gender Detection from Indian Names ──────────────────────────────────────

FEMALE_NAMES = {
    "priya", "ananya", "meera", "mira", "pooja", "puja", "neha", "kavya",
    "riya", "ria", "anjali", "swati", "divya", "shruti", "shruthi",
    "aisha", "ayesha", "deepa", "geeta", "gita", "sunita", "rekha",
    "nisha", "shalini", "pallavi", "manju", "jaya", "lakshmi", "padma",
    "radha", "sita", "seeta", "asha", "aruna", "usha", "lata", "nirmala",
    "kamala", "vijaya", "shobha", "vani", "gauri", "gouri", "uma", "devi",
    "rani", "malini", "seema", "reena", "rina", "sara", "sarah", "zara",
    "fatima", "khadija", "anamika", "bhavna", "bhavana", "chitra", "damini",
    "ekta", "falguni", "garima", "harini", "isha", "jyoti", "jyothi",
    "kalpana", "lalita", "madhu", "madhuri", "namita", "nandini", "parvati",
    "radhika", "rashi", "rashmi", "sakshi", "sandhya", "sarita", "savita",
    "shweta", "smita", "sneha", "sonia", "sonya", "sudha", "sujata",
    "tanvi", "tara", "trisha", "tulsi", "varsha", "vidya", "yamini",
    "yasmin", "zainab", "aditi", "amrita", "arti", "aarti", "chandni",
    "disha", "esha", "hema", "indira", "juhi", "karishma", "kirti",
    "kriti", "manisha", "megha", "mohini", "nikita", "poonam", "preeti",
    "rachana", "rachna", "ritika", "ritu", "sadhana", "sapna", "shikha",
    "shilpa", "simran", "sonali", "supriya", "tanuja", "urmila", "vaishali",
    "vandana", "veena", "mamta", "mala", "padmini", "purnima", "pushpa",
    "ramya", "ranjana", "rohini", "roopa", "rupa", "sangeeta", "saroj",
    "sharmila", "sheela", "sridevi", "sumitra", "vibha", "aadhya",
    "anushka", "avni", "diya", "ishita", "khushi", "kiara", "myra",
    "navya", "saanvi", "shanaya", "sia", "tanya", "zoya", "aanya",
    "aarushi", "kashvi", "mahi", "pari", "pihu", "ridhima", "samaira",
    "sana", "shreya", "shriya", "akshara", "chaitra", "deeksha", "diksha",
    "gayatri", "lavanya", "meghana", "nithya", "nivedita", "sahana",
    "deepika", "devika", "dhanya", "ganga", "hansa", "jayashree",
    "kalyani", "kumari", "nalini", "nandita", "prabha", "pratibha",
    "prema", "revati", "shakti", "shanti", "vasanti", "vimala",
    "mary", "jessica", "jennifer", "amanda", "ashley", "emily",
    "sophia", "olivia", "emma", "isabella", "mia", "charlotte",
    "elizabeth", "margaret", "alice", "jane", "helen", "grace",
    "lily", "anna", "maria", "catherine", "karen", "nancy", "lisa",
    "betty", "sandra", "donna", "carol", "ruth", "sharon", "susan",
    "barbara", "patricia", "deborah", "stephanie", "cynthia",
    "martha", "angela", "amy", "andrea", "christina", "diana",
    "heather", "laura", "michelle", "rachel", "rebecca", "samantha",
    "victoria", "natasha", "natalie", "nicole", "pamela", "paula",
    "teresa", "valerie", "virginia", "wendy", "yvonne",
}


def detect_gender(name: str) -> str:
    """Return 'Sir' or 'Madam' based on first name."""
    first = name.strip().split()[0].lower()
    return "Madam" if first in FEMALE_NAMES else "Sir"


# ─── System Prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are Maya, a customer executive at Škoda Auto India.
You are on a live phone call right now.

PERSONA:
- Strictly polite, respectful, and professional at all times.
- You speak the way a well-mannered Indian customer care executive speaks — formal, clear, warm.
- You sound like a real person, not a robot. You know Škoda inside out.
- Your tone is calm and measured — like a trained executive in a quiet office.
- NEVER be casual or over-familiar. No friendly banter. No jokes.

════════════════════════════════════════════════════════════════
ABSOLUTE LANGUAGE LAW — THIS OVERRIDES EVERYTHING ELSE:
════════════════════════════════════════════════════════════════
The customer's CHOSEN language is provided in CUSTOMER context as "Language:".
You MUST respond in EXACTLY that language for the ENTIRE conversation.

IF Language = "Hindi — respond ONLY in Hindi":
  → Every single word must be in Hindi (Roman script).
  → The ONLY English words allowed: Škoda, Kushaq, Slavia, Superb, Kodiaq.
  → Do NOT use English grammar. Do NOT slip into English mid-sentence.
  → Perfect Hindi examples:
    "Bilkul. Aap kaunse variant mein interested hain — Active ya Style?"
    "Samajh gayi. Aapka budget kitna hai?"
    "Zaroor. Aapke sheher mein test drive arrange kar sakti hoon."
    "Haan ji. Škoda Kushaq ek bahut accha choice hai. Kab available hain aap?"
    "Ji zaroor. Main aapke liye Bangalore mein test drive book karungi."

IF Language = "Hindi/English (Hinglish) — mirror this mixed style":
  → Mix Hindi and English naturally in EVERY response.
  → Perfect Hinglish examples:
    "Bilkul, the Kushaq Style variant ek excellent choice hai. Test drive kab lenge?"
    "Samajh gaya. Budget around 15 lakhs hai toh Ambition variant fit hoga."
    "Ji zaroor, Bangalore mein hamare dealership mein visit kar sakte hain."

IF Language = "English — respond in English":
  → Respond entirely in English. No Hindi words.

NEVER switch language mid-call. Once set, language is fixed.
════════════════════════════════════════════════════════════════

ACKNOWLEDGMENT VARIETY — CRITICAL RULE:
NEVER start two consecutive responses with the same word. Rotate:
  English pool: "Certainly.", "Understood.", "Noted.", "Of course.", "Very well."
  Hindi pool: "Ji zaroor.", "Samajh gaya.", "Theek hai.", "Haan ji.", "Zaroor.", "Bilkul."
  Keep rotating. Same opener twice in a row sounds robotic.

SPEED & BREVITY (CRITICAL):
- Maximum 1-2 SHORT sentences. Aim for 10-20 words.
- One question per turn. NEVER ask two things at once.
- No filler words. No preambles. Go straight to the point.

STRICT RULES:
- No bullet points, no lists, no markdown, no emojis, no asterisks.
- Never break character. You are Maya, a real person.
- Never repeat anything you already said in this conversation.
- Never start a sentence with "I" twice in the same response.
- If customer asks something, answer briefly first, then one follow-up.
- NEVER end the call yourself. The system handles call endings.
- Do NOT say goodbye or "thank you for calling" — system adds that automatically.

ŠKODA KNOWLEDGE:
- Kushaq (Compact SUV): 11.89L to 17.99L. 1.0 TSI or 1.5 TSI. 5-star Global NCAP.
- Slavia: Active has 2 airbags. Ambition/Style/Monte Carlo have 6 airbags. 521L boot. 11.39L onwards.
- Superb (Flagship): 33.99L onwards. 2.0 TSI, 190 PS. Virtual cockpit. 8 airbags.
- Kodiaq (Full-size SUV): 39.99L onwards. AWD. 7-seater. Panoramic sunroof.
- Service every 15K km / 1 year. 4-year warranty. Škoda Shield up to 5 years.
- Trade-in bonus up to 75K. Finance: SBI, HDFC, ICICI, Kotak.

CALL OBJECTIVE:
Follow up on their Škoda enquiry. Ask natural questions to understand their needs — model, city, budget, timeline. Guide toward test drive booking or showroom visit.\
"""


# ─── Text Cleanup for TTS ─────────────────────────────────────────────────────

def humanize_for_speech(text: str) -> str:
    """Clean LLM output so it sounds natural when spoken by TTS."""
    result = text

    # Strip markdown
    result = re.sub(r'\*\*(.+?)\*\*', r'\1', result)
    result = re.sub(r'\*(.+?)\*',   r'\1', result)
    result = re.sub(r'#{1,6}\s+',   '',    result)
    result = re.sub(r'`(.+?)`',      r'\1', result)

    # Currency / numbers
    result = re.sub(r'₹\s*',                             'rupees ',        result)
    result = re.sub(r'(\d+(?:\.\d+)?)\s*[Cc]r(?:ore)?s?', r'\1 crore',     result)
    result = re.sub(r'(\d+(?:\.\d+)?)\s*[Ll](?:akh|akhs)?', r'\1 lakh',    result)

    # Automotive abbreviations — use natural spoken forms, not letter-by-letter spelling
    # (letter-by-letter e.g. "T S I" forces a robotic spelling prosody in ElevenLabs)
    for abbr, spoken in [('TSI','tee-ess-eye'),('DSG','dee-ess-gee'),
                          ('NCAP','en-cap'),('BHP','brake horsepower'),
                          ('EMI','monthly instalment'),('AWD','all-wheel drive'),
                          ('SUV','S-U-V'),('EV','E-V')]:
        result = result.replace(abbr, spoken)

    # Remove lists
    result = re.sub(r'^\s*[\-•→]\s+', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\d+[\\.\\\)]\s+', '', result, flags=re.MULTILINE)

    # Strip "Maya:" prefix
    if result.lower().startswith("maya:"):
        result = result[5:].strip()

    # Strip citation markers
    result = re.sub(r'\[\d+\]', '', result)

    return re.sub(r'\s+', ' ', result).strip()


# ─── Language Detection ──────────────────────────────────────────────────────

# Hindi words commonly written in Roman script (Hinglish markers)
_HINDI_ROMAN = {
    "haan", "han", "nahin", "nahi", "nai", "kya", "aap", "aapka", "mujhe",
    "theek", "thik", "bilkul", "zaroor", "batao", "bolo", "boliye", "suniye",
    "yaar", "bhai", "ji", "accha", "acha", "sahi", "vahi", "woh", "yeh",
    "toh", "bhi", "aur", "lekin", "phir", "sab", "karo", "chahiye", "chahte",
    "dekho", "samajh", "iska", "uska", "kitna", "kitne", "pukar", "sunna",
    "ek", "do", "teen", "char", "paanch", "das", "hazaar", "lakh",
}


def _detect_language(text: str) -> str:
    """Return 'hindi', 'hinglish', or 'english' based on customer input."""
    lower = text.lower().strip()

    # Devanagari Unicode block → pure Hindi
    if any('\u0900' <= c <= '\u097f' for c in text):
        return "hindi"

    # Explicit language selection keywords (LANGUAGE_SELECT state)
    if lower in ("hindi", "hind", "hindi bolein", "hindi mein"):
        return "hindi"
    if lower in ("english", "angrezi", "english bolein", "eng"):
        return "english"

    # Hindi words in Roman script → Hinglish
    words = set(lower.split())
    hindi_hits = words & _HINDI_ROMAN
    if hindi_hits:
        # If more than half the words are Hindi-Roman, call it 'hindi'
        # Otherwise it's hinglish (mixed)
        return "hindi" if len(hindi_hits) / max(len(words), 1) > 0.5 else "hinglish"
    return "english"


def _language_instruction(lang: str) -> str | None:
    """Per-turn CRITICAL language instruction injected into every LLM call."""
    if lang == "hindi":
        return (
            "CRITICAL — LANGUAGE OVERRIDE: Customer chose Hindi. "
            "You MUST reply ENTIRELY in Hindi (Roman script, NOT Devanagari). "
            "Do NOT use any English words except Škoda model names. "
            "Example: 'Bilkul, aapki enquiry ke baare mein baat karte hain. "
            "Aap kaunse model mein interested hain?'"
        )
    if lang == "hinglish":
        return (
            "CRITICAL — LANGUAGE OVERRIDE: Customer is mixing Hindi and English (Hinglish). "
            "MUST mirror this style — mix Hindi and English naturally. "
            "Example: 'Bilkul, the Kushaq Style variant ek excellent choice hai. "
            "Test drive kab lenge aap?'"
        )
    return None


# ─── Conversation History ─────────────────────────────────────────────────────

def _build_history_messages(session: "CallSession") -> list[dict]:
    messages = []
    if not session.transcript:
        return messages
    for turn in session.transcript[-14:]:
        role = "assistant" if turn["speaker"] == "agent" else "user"
        messages.append({"role": role, "content": turn["text"]})
    return messages


def _build_known_profile(prefs: dict) -> str:
    known = []
    fields = [
        ("vehicle_model", "Model"),
        ("variant", "Variant"),
        ("enquiry_type", "Enquiry"),
        ("location", "City"),
        ("budget", "Budget"),
        ("transmission", "Transmission"),
        ("purpose", "Purpose"),
    ]
    for key, label in fields:
        if prefs.get(key):
            known.append(f"{label}: {prefs[key]}")
    return ", ".join(known) if known else "Nothing yet"


def _build_stage_hint(session: "CallSession") -> str:
    prefs = session.lead.get("preferences", {})

    # Work out what we still need — ask for the first missing piece only
    if not prefs.get("vehicle_model"):
        return "Ask: which Škoda model they are interested in (Kushaq / Slavia / Superb / Kodiaq)."
    if not prefs.get("enquiry_type"):
        return "Ask: are they looking to buy, book a test drive, or get service."
    if not prefs.get("variant") and prefs.get("vehicle_model") in ("Škoda Slavia", "Škoda Kushaq"):
        return "Ask: which variant — Active, Ambition, Style, or Monte Carlo."
    if not prefs.get("location"):
        return "Ask: which city they are based in, to find the nearest showroom."
    if not prefs.get("budget"):
        return "Ask: their approximate budget range — gently, one question."
    # All key info collected — push toward next step
    model   = prefs.get("vehicle_model", "the vehicle")
    city    = prefs.get("location", "their city")
    enq     = prefs.get("enquiry_type", "purchase")
    return (
        f"All key details collected ({model}, {city}, {enq}). "
        f"Now guide toward a test drive booking or showroom visit. Get a firm commitment."
    )


def _build_customer_context(session: "CallSession") -> str:
    lead  = session.lead
    prefs = lead.get("preferences", {})
    first_name = lead["name"].split()[0]
    honorific = detect_gender(lead["name"])

    lang = lead.get("preferred_language", "english")
    lang_display = {
        "hindi":    "Hindi — respond ONLY in Hindi",
        "hinglish": "Hindi/English (Hinglish) — mirror this mixed style",
        "english":  "English — respond in English",
    }.get(lang, "English — respond in English")

    return (
        f"CUSTOMER: {lead['name']} ({honorific}), use '{first_name}'\n"
        f"Source: {lead.get('source','Website enquiry')}\n"
        f"Language: {lang_display}\n"
        f"Known: {_build_known_profile(prefs)}\n"
        f"Stage: {_build_stage_hint(session)}"
    )


# ─── Shared message builder (OpenAI & xAI use the same format) ───────────────

def _build_messages(session: "CallSession", user_input: str, situation: str = None) -> list[dict]:
    """Build the messages array for the xAI API call."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _build_customer_context(session)},
    ]
    if situation:
        messages.append({"role": "system", "content": f"SITUATION: {situation}"})
    messages.extend(_build_history_messages(session))
    if user_input:
        # Per-turn language detection — but ALWAYS honour the session's chosen language
        # (so short English words like 'han' don't override an explicit Hindi selection)
        turn_lang  = _detect_language(user_input)
        sess_lang  = session.lead.get("preferred_language", "english")
        # If session chose Hindi/Hinglish, that overrides a vague per-turn detection
        effective_lang = sess_lang if sess_lang in ("hindi", "hinglish") else turn_lang
        lang_hint = _language_instruction(effective_lang)
        if lang_hint:
            messages.append({"role": "system", "content": lang_hint})
        messages.append({"role": "user", "content": user_input})
    return messages


# ─── xAI Grok Brain ──────────────────────────────────────────────────────────

async def _call_xai(session: "CallSession", user_input: str, situation: str = None) -> str:
    """Call xAI via Chat Completions API — non-streaming with concurrency guard + backoff retry."""
    messages = _build_messages(session, user_input, situation)
    print(f"[xAI] Calling {XAI_MODEL} with {len(messages)} messages...")

    client = _get_http_client()
    last_error = None

    for attempt in range(2):          # 2 attempts max — fast-fail for voice
        if attempt > 0:
            delay = 0.8               # tight 800 ms backoff — voice can't wait 3 s
            print(f"[xAI] Retry 1/1 in {delay:.1f}s...")
            await asyncio.sleep(delay)
        try:
            response = await client.post(
                "https://api.x.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {_xai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": XAI_MODEL,
                    "messages": messages,
                    "max_tokens": 55,
                    "temperature": 0.50,
                },
                timeout=httpx.Timeout(5.5, connect=3.0),
            )

            if response.status_code == 200:
                data = response.json()
                text = data["choices"][0]["message"]["content"].strip()
                if attempt > 0:
                    print(f"[xAI] OK (attempt {attempt + 1})  Response: {text[:100]}...")
                else:
                    print(f"[xAI] OK  Response: {text[:100]}...")
                return text

            if response.status_code == 429:
                retry_after = float(response.headers.get("retry-after", 4.0))
                print(f"[xAI] 429 Rate limit — waiting {retry_after:.1f}s")
                await asyncio.sleep(retry_after)
                last_error = Exception("xAI 429 rate limit")
                continue

            if response.status_code in (500, 502, 503, 504):
                print(f"[xAI] ERR {response.status_code} on attempt {attempt + 1} — will retry")
                last_error = Exception(f"xAI API error {response.status_code}")
                continue

            body = response.text[:500]
            print(f"[xAI] ERR API returned {response.status_code}: {body}")
            raise Exception(f"xAI API error {response.status_code}: {body}")

        except Exception as e:
            if "xAI API error 4" in str(e):  # 4xx — don't retry
                raise
            print(f"[xAI] ERR attempt {attempt + 1}: {type(e).__name__}: {e}")
            last_error = e

    raise last_error or Exception("xAI: all attempts failed")


async def _call_xai_streaming(session: "CallSession", user_input: str, situation: str = None):
    """Streaming xAI Chat Completions — yields sentence chunks as soon as ready."""
    messages = _build_messages(session, user_input, situation)
    print(f"[xAI] Streaming {XAI_MODEL} with {len(messages)} messages...")

    client = _get_http_client()
    buffer = ""
    full_response = ""
    SENTENCE_ENDS = {'.', '!', '?'}

    async with client.stream(
            "POST",
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {_xai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": XAI_MODEL,
                "messages": messages,
                "max_tokens": 55,
                "temperature": 0.50,
                "stream": True,
            },
        ) as response:
            if response.status_code == 429:
                retry_after = float(response.headers.get("retry-after", 4.0))
                print(f"[xAI] 429 on streaming — waiting {retry_after:.1f}s")
                await asyncio.sleep(retry_after)
                raise Exception("xAI streaming 429 rate limit")
            if response.status_code != 200:
                body = await response.aread()
                print(f"[xAI] ERR Streaming API returned {response.status_code}")
                raise Exception(f"xAI streaming error {response.status_code}")

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    token = delta.get("content", "")
                    if not token:
                        continue
                    buffer += token
                    full_response += token

                    # Yield on sentence boundary — ≥10 chars avoids single-word TTS calls
                    if buffer.rstrip() and buffer.rstrip()[-1] in SENTENCE_ENDS and len(buffer.strip()) >= 10:
                        sentence = buffer.strip()
                        buffer = ""
                        print(f"[xAI] Stream chunk: \"{sentence}\"")
                        yield sentence
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue

    # Yield any remaining buffer
    if buffer.strip():
        print(f"[xAI] Stream final: \"{buffer.strip()}\"")
        yield buffer.strip()

    print(f"[xAI] Full streaming response: {full_response[:120]}...")



# --- xAI TTS ---

async def xai_text_to_speech(text: str, voice: str = None) -> Optional[bytes]:
    if not _xai_api_key:
        return None

    client = _get_http_client()
    response = await client.post(
        XAI_TTS_URL,
        headers={
            "Authorization": f"Bearer {_xai_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "text": text,
            "voice_id": voice or XAI_VOICE,
            "language": "en",
            "output_format": {
                "codec": "mp3",
                "sample_rate": 24000,
                "bit_rate": 128000,
            },
        },
        timeout=httpx.Timeout(6.0, connect=4.0),
    )
    if response.status_code == 200:
        return response.content
    else:
        print(f"[xAI TTS] ERR {response.status_code}: {response.text[:200]}")
        return None


async def xai_tts_stream_sentences(text: str, voice: str = None):
    """Split text into sentences and yield (sentence, audio_bytes) pairs."""
    import re
    sentences = re.split(r'(?<=[.!?,])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]
    for sentence in sentences:
        audio = await xai_text_to_speech(sentence, voice)
        if audio:
            yield sentence, audio


# --- ElevenLabs TTS (Primary) ---

async def elevenlabs_text_to_speech(
    text: str,
    previous_request_id: Optional[str] = None,
) -> tuple[Optional[bytes], Optional[str]]:
    """
    ElevenLabs TTS — returns (audio_bytes, request_id).
    Guarded by _elevenlabs_semaphore (max 2 concurrent) to stay under the plan limit of 3.
    Retries once on 429 after waiting retry-after seconds, so bursts queue rather than
    fall through to the xAI TTS fallback (which has a different voice).
    """
    if not _elevenlabs_api_key:
        return None, None

    body: dict = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability":         0.50,
            "similarity_boost":  0.80,
            "style":             0.20,
            "use_speaker_boost": True,
        },
    }
    if previous_request_id:
        body["previous_request_ids"] = [previous_request_id]

    client = _get_http_client()

    async with _elevenlabs_semaphore:
        for attempt in range(2):
            response = await client.post(
                ELEVENLABS_TTS_URL,
                headers={
                    "xi-api-key": _elevenlabs_api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json=body,
                timeout=httpx.Timeout(15.0, connect=5.0),
            )
            if response.status_code == 200:
                request_id = response.headers.get("request-id") or response.headers.get("x-request-id")
                return response.content, request_id
            if response.status_code == 429 and attempt == 0:
                retry_after = float(response.headers.get("retry-after", 1.5))
                print(f"[ElevenLabs TTS] 429 — queued, retrying in {retry_after:.1f}s")
                await asyncio.sleep(retry_after)
                continue
            print(f"[ElevenLabs TTS] ERR {response.status_code}: {response.text[:200]}")
            return None, None

    return None, None


async def tts(text: str) -> Optional[bytes]:
    """Primary TTS entry point. Tries ElevenLabs (Tara) first, falls back to xAI."""
    audio, _ = await elevenlabs_text_to_speech(text)
    if audio:
        return audio
    return await xai_text_to_speech(text)


async def tts_pcm_8k(text: str) -> Optional[bytes]:
    """ElevenLabs TTS returning raw 8kHz 16-bit mono PCM — for Twilio Media Streams.
    No ffmpeg required: output_format=pcm_8000 skips MP3 encoding entirely."""
    if not _elevenlabs_api_key:
        return None
    url = f"{ELEVENLABS_TTS_URL}?output_format=pcm_8000"
    body = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability":        0.50,
            "similarity_boost": 0.80,
            "style":            0.20,
            "use_speaker_boost": True,
        },
    }
    client = _get_http_client()
    async with _elevenlabs_semaphore:
        for attempt in range(2):
            response = await client.post(
                url,
                headers={"xi-api-key": _elevenlabs_api_key, "Content-Type": "application/json"},
                json=body,
                timeout=httpx.Timeout(15.0, connect=5.0),
            )
            if response.status_code == 200:
                return response.content
            if response.status_code == 429 and attempt == 0:
                retry_after = float(response.headers.get("retry-after", 1.5))
                await asyncio.sleep(retry_after)
                continue
            print(f"[ElevenLabs PCM] ERR {response.status_code}: {response.text[:200]}")
            return None
    return None


async def get_streaming_response_with_tts(session, user_input: str, situation: str = None):
    """
    Combined streaming LLM + TTS pipeline.
    Yields (sentence_text, audio_base64) tuples as fast as possible.

    Order: xAI Grok streaming → (on failure) xAI Grok non-streaming → rule-based.
    """
    if _xai_api_key:
        try:
            prev_request_id: Optional[str] = None
            async for sentence_chunk in _call_xai_streaming(session, user_input, situation):
                cleaned = humanize_for_speech(sentence_chunk)
                if cleaned:
                    audio, prev_request_id = await elevenlabs_text_to_speech(
                        cleaned, previous_request_id=prev_request_id
                    )
                    if not audio:
                        audio = await xai_text_to_speech(cleaned)
                    audio_b64 = base64.b64encode(audio).decode("utf-8") if audio else None
                    yield cleaned, audio_b64
            return
        except Exception as e:
            print(f"[xAI] Streaming failed ({type(e).__name__}: {e}) — falling back to non-streaming")
            try:
                raw = await _call_xai(session, user_input, situation)
                cleaned = humanize_for_speech(raw)
                if cleaned:
                    audio = await tts(cleaned)
                    audio_b64 = base64.b64encode(audio).decode("utf-8") if audio else None
                    yield cleaned, audio_b64
                return
            except Exception as e2:
                print(f"[xAI] Non-streaming also failed: {e2}")

    # Rule-based fallback (API fully down)
    text = _rule_based_fallback(user_input, session)
    if text:
        audio = await tts(text)
        audio_b64 = base64.b64encode(audio).decode("utf-8") if audio else None
        yield text, audio_b64


# ─── xAI Realtime Voice Session Config ────────────────────────────────────────

def build_xai_session_config(lead: dict) -> dict:
    first_name = lead["name"].split()[0]
    prefs = lead.get("preferences", {})

    customer_context = (
        f"\n\nCUSTOMER: {lead['name']} (use '{first_name}')\n"
        f"Source: {lead.get('source', 'Website enquiry')}\n"
        f"Known: {_build_known_profile(prefs)}\n"
        f"\nStart by confirming identity: 'Hello, am I speaking with {first_name}?'"
    )

    return {
        "type": "session.update",
        "session": {
            "voice": XAI_VOICE,
            "instructions": SYSTEM_PROMPT + customer_context,
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.80,           # slightly lower for Indian accented speech
                "silence_duration_ms": 600,   # faster turn-taking for natural flow
                "prefix_padding_ms": 250,     # less pre-padding = faster response
            },
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": XAI_SAMPLE_RATE}
                },
                "output": {
                    "format": {"type": "audio/pcm", "rate": XAI_SAMPLE_RATE}
                }
            }
        }
    }


# ─── Main Entry Point ────────────────────────────────────────────────────────

async def get_ai_response(session: "CallSession", user_input: str, situation: str = None) -> str:
    if _active_backend is None:
        init_llm_backend()

    if _xai_api_key:
        try:
            raw = await _call_xai(session, user_input, situation)
            return humanize_for_speech(raw)
        except Exception as e:
            print(f"[xAI] FAILED: {e} — falling back to rule-based")

    # 3. Rule-based (all APIs down)
    return _rule_based_fallback(user_input, session)


# ─── Rule-Based Fallback (only used when API is down) ────────────────────────

def _rule_based_fallback(user_input: str, session: "CallSession") -> str:
    """Context-aware fallback. Only runs if ALL API calls fail."""
    text       = user_input.lower()
    lead       = session.lead
    prefs      = lead.get("preferences", {})
    first_name = lead["name"].split()[0]
    model      = prefs.get("vehicle_model", "Škoda vehicle")

    # Always acknowledge what the customer said first, then respond
    if any(w in text for w in ["price","cost","how much","budget","rate","lakh","crore","on road"]):
        return humanize_for_speech(
            f"Our range starts from around 11.39 lakh for the Slavia "
            f"and goes up to about 44.99 lakh for the Kodiaq L and K. "
            f"Which model caught your eye, {first_name}?"
        )
    if any(w in text for w in ["service","maintenance","repair","workshop"]):
        return humanize_for_speech(
            f"Sure, we can help with that. Scheduled service is every 15,000 km or 1 year. "
            f"Would you like me to book a service appointment?"
        )
    if any(w in text for w in ["warranty","extended","shield"]):
        return humanize_for_speech(
            f"All Škoda vehicles come with 4 years warranty standard. "
            f"Škoda Shield extends it up to 5 years. Want me to share the details?"
        )
    if any(w in text for w in ["loan","emi","finance","bank","down payment"]):
        return humanize_for_speech(
            f"We have tie-ups with SBI, HDFC, ICICI, and Kotak. "
            f"Would you like me to connect you with our finance advisor?"
        )
    if any(w in text for w in ["test drive","drive","demo","try"]):
        return humanize_for_speech(
            f"A test drive is the best way to experience it. "
            f"When would be convenient for you?"
        )
    if any(w in text for w in ["kushaq","slavia","superb","kodiaq","rapid","octavia"]):
        model_name = "Kushaq" if "kushaq" in text else "Slavia" if "slavia" in text else \
                     "Superb" if "superb" in text else "Kodiaq" if "kodiaq" in text else \
                     "Rapid" if "rapid" in text else "Octavia"
        return humanize_for_speech(
            f"The {model_name} is an excellent choice. "
            f"Which variant are you considering?"
        )
    if any(w in text for w in ["new car","new purchase","buy","buying","purchase"]):
        return humanize_for_speech(
            f"That's great! Which Škoda model has caught your attention — "
            f"the Kushaq, the Slavia, or something else?"
        )
    if any(w in text for w in ["manual","automatic","dsg","mt","at"]):
        pref = "automatic" if any(w in text for w in ["automatic","dsg","at"]) else "manual"
        return humanize_for_speech(
            f"Got it, {pref} it is. Have you had a chance to take a test drive yet?"
        )
    if any(w in text for w in ["safety","airbag","ncap","safe"]):
        return humanize_for_speech(
            f"Safety is definitely a strong point for Škoda. "
            f"The Kushaq has a 5-star Global N cap rating, which is the highest. "
            f"Would you like to know more about the safety features?"
        )
    if any(w in text for w in ["model","models","latest","available","range","lineup"]):
        return humanize_for_speech(
            f"Currently we have the Kushaq starting at 11.89 lakh, "
            f"the Slavia from 11.39 lakh, the Superb from 33.99 lakh, "
            f"and the Kodiaq from 39.99 lakh. Which one interests you?"
        )

    # Generic — ask something relevant we don't know yet
    if not prefs.get("vehicle_model"):
        return humanize_for_speech(
            f"Could you tell me which Škoda model you're looking at, {first_name}?"
        )
    if not prefs.get("location"):
        return humanize_for_speech(
            f"And which city are you based in? I'll find the nearest showroom for you."
        )
    if not prefs.get("budget"):
        return humanize_for_speech(
            f"What budget range are you comfortable with?"
        )

    # True fallback — connection issue message
    return humanize_for_speech(
        f"I appreciate your interest, {first_name}. "
        f"Would you like me to arrange a test drive or send more details?"
    )
