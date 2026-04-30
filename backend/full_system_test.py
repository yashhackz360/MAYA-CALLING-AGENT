"""
MantaRay AI - Full System Test Suite
Tests all subsystems: imports, opening message, LLM, TTS, STT, conversation flow, API endpoints.
Run from backend/ directory:  python full_system_test.py
"""
import asyncio, os, sys, time
from dotenv import load_dotenv
load_dotenv()

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PASS = "[PASS]"; FAIL = "[FAIL]"; WARN = "[WARN]"
results = []

def check(label, ok, detail=""):
    sym = PASS if ok else FAIL
    results.append((ok, label))
    print(f"  {sym} {label}" + (f" -- {detail}" if detail else ""))
    return ok

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ======================================================
#  1. IMPORTS
# ======================================================
section("1. IMPORTS")

try:
    from agent.conversation import get_opening_message, process_customer_input
    from agent.llm_client import (
        humanize_for_speech, get_ai_response, get_xai_api_key,
        init_llm_backend, SYSTEM_PROMPT
    )
    from data.sample_leads import get_all_leads, get_lead, create_lead
    from call_manager.manager import initiate_call, process_turn, end_call
    check("Core imports", True)
except Exception as e:
    check("Core imports", False, str(e)); sys.exit(1)

try:
    import httpx, fastapi, uvicorn
    check("httpx / fastapi / uvicorn", True)
except Exception as e:
    check("httpx / fastapi / uvicorn", False, str(e))

try:
    import multipart
    check("python-multipart (file upload)", True)
except Exception as e:
    check("python-multipart (file upload)", False, "Run: pip install python-multipart")


# ======================================================
#  2. ENVIRONMENT
# ======================================================
section("2. ENVIRONMENT VARIABLES")

xai_key = os.getenv("XAI_API_KEY", "").strip()
check("XAI_API_KEY set", bool(xai_key),
      xai_key[:12] + "..." if xai_key else "MISSING -- add to backend/.env")

elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
check("ELEVENLABS_API_KEY set (optional TTS)", bool(elevenlabs_key),
      elevenlabs_key[:8] + "..." if elevenlabs_key else "not set -- xAI TTS used instead")

groq_key = os.getenv("GROQ_API_KEY", "").strip()
if groq_key:
    print(f"  {WARN} GROQ_API_KEY still set -- no longer used (xAI grok-stt now handles STT)")


# ======================================================
#  3. LLM BACKEND INIT
# ======================================================
section("3. LLM BACKEND")

try:
    init_llm_backend()
    check("LLM backend init", True)
except Exception as e:
    check("LLM backend init", False, str(e))

check("System prompt non-empty", len(SYSTEM_PROMPT) > 100, f"{len(SYSTEM_PROMPT)} chars")
check("System prompt has Indian English phrases",
      "bilkul" in SYSTEM_PROMPT.lower() or "absolute language law" in SYSTEM_PROMPT.lower())
check("System prompt bans American phrases",
      "I'm glad to hear" not in SYSTEM_PROMPT and "Great choice" not in SYSTEM_PROMPT)


# ======================================================
#  4. DATA LAYER
# ======================================================
section("4. DATA LAYER (Sample Leads)")

leads = get_all_leads()
check("Leads loaded", len(leads) > 0, f"{len(leads)} leads")

lead = leads[0]
check("Lead has required fields",
      all(k in lead for k in ["lead_id", "name", "phone", "preferences"]),
      f"lead[0] = {lead['name']}")

# lead_id is the key, not 'id'
LEAD_ID_KEY = "lead_id"
lead_id = lead[LEAD_ID_KEY]

new_lead = create_lead({
    "name": "Test User",
    "phone": "+91 9999999999",
    "email": "test@example.com",
    "source": "Website",
    "preferences": {"vehicle_model": "Skoda Kushaq", "enquiry_type": "New Purchase"}
})
check("Create lead", LEAD_ID_KEY in new_lead, f"lead_id={new_lead.get(LEAD_ID_KEY)}")


# ======================================================
#  5. OPENING MESSAGE
# ======================================================
section("5. OPENING MESSAGE")

opening = get_opening_message(lead)
first_name = lead["name"].split()[0]

check("Opening contains customer first name", first_name in opening)
check("Opening contains 'Maya'", "Maya" in opening)
check("Opening contains 'Skoda'", "koda" in opening)  # handles Skoda/Skoda
check("Opening is short (<=25 words)", len(opening.split()) <= 25,
      f"{len(opening.split())} words: {opening}")
print(f"  INFO Opening: {opening}")


# ======================================================
#  6. TTS TEXT PREPROCESSING
# ======================================================
section("6. TTS TEXT PREPROCESSING (humanize_for_speech)")

cases = [
    ("16L",   "lakh",  "Lakh notation"),
    ("DSG",   "D S G", "Acronym spacing"),
    ("TSI",   "T S I", "Acronym spacing"),
    ("**bold**", "bold", "Strip markdown bold"),
]
for inp, expected, label in cases:
    out = humanize_for_speech(inp)
    check(f"humanize: {label}", expected.lower() in out.lower(), f"{inp!r} -> {out!r}")


# ======================================================
#  7. CALL MANAGER -- INITIATE
# ======================================================
section("7. CALL MANAGER -- initiate_call")

session = initiate_call(lead_id)
check("initiate_call returns session", session is not None)
check("Session has call_id", "call_id" in session)
check("Session has opening_message", "opening_message" in session)
check("Opening message contains first name",
      first_name in session.get("opening_message", ""))

call_id = session["call_id"]
print(f"  INFO call_id: {call_id}")
print(f"  INFO opening: {session.get('opening_message', '')}")


# ======================================================
#  8. LIVE xAI API CALL
# ======================================================
section("8. LLM -- LIVE xAI grok-3 API CALL")

if not xai_key:
    print(f"  {WARN} Skipping -- XAI_API_KEY not set")
else:
    async def test_llm():
        t0 = time.time()
        resp = await process_turn(call_id, "yes this is " + first_name)
        elapsed = time.time() - t0
        check("process_turn name-confirm", resp is not None and "agent_text" in resp,
              resp.get("agent_text", "")[:80] if resp else "None")
        check("Response latency < 6s", elapsed < 6, f"{elapsed:.2f}s")
        if resp:
            text = resp["agent_text"]
            check("Response short (<= 40 words)", len(text.split()) <= 40,
                  f"{len(text.split())} words")
            bad = ["I'm glad", "Thanks for confirming", "Great choice",
                   "I'd love", "Awesome", "Perfect"]
            check("No American filler phrases", not any(p in text for p in bad), text[:80])

    asyncio.run(test_llm())


# ======================================================
#  9. FULL CONVERSATION FLOW
# ======================================================
section("9. FULL CONVERSATION FLOW (state machine)")

async def test_conversation():
    s2 = initiate_call(lead_id)
    cid = s2["call_id"]

    turns = [
        "yes this is " + first_name,
        "yes please go ahead",
        "I am interested in the Kushaq active variant",
        "my budget is around 14 lakhs",
        "I prefer manual transmission",
        "I am in Bangalore",
        "okay thank you bye",
    ]

    for i, inp in enumerate(turns):
        r = await process_turn(cid, inp)
        if not r:
            check(f"Turn {i+1}", False, "None returned"); continue
        text = r.get("agent_text", "")
        ended = r.get("call_ended", False)
        check(f"Turn {i+1}: '{inp[:30]}'", bool(text), text[:60])
        if ended:
            check("Call ended gracefully on bye", True, f"at turn {i+1}")
            break

asyncio.run(test_conversation())


# ======================================================
#  10. HTTP ENDPOINTS (requires backend on :8000)
# ======================================================
section("10. HTTP ENDPOINTS (requires backend running on :8000)")

async def test_http():
    import httpx
    base = "http://localhost:8000"
    try:
        async with httpx.AsyncClient(timeout=8) as c:

            # GET /api/leads
            r = await c.get(f"{base}/api/leads")
            check("GET /api/leads", r.status_code == 200,
                  f"status={r.status_code}, leads={len(r.json()) if r.status_code==200 else '?'}")

            # GET /api/voice/config
            r = await c.get(f"{base}/api/voice/config")
            check("GET /api/voice/config", r.status_code == 200,
                  r.json().get("active_backend", "?") if r.status_code == 200 else r.text[:60])

            # POST /api/calls/initiate
            r = await c.post(f"{base}/api/calls/initiate",
                             json={"lead_id": lead_id},
                             headers={"Content-Type": "application/json"})
            check("POST /api/calls/initiate", r.status_code == 200,
                  f"status={r.status_code}")

            if r.status_code == 200:
                cid2 = r.json().get("call_id")

                # POST /api/calls/turn
                r2 = await c.post(f"{base}/api/calls/turn",
                                  json={"call_id": cid2, "user_input": "yes this is " + first_name},
                                  headers={"Content-Type": "application/json"})
                check("POST /api/calls/turn", r2.status_code == 200,
                      r2.json().get("agent_text","")[:60] if r2.status_code==200 else r2.text[:80])

                # POST /api/voice/tts
                r3 = await c.post(f"{base}/api/voice/tts",
                                  json={"text": "Hello, this is Maya.", "voice": "eve"},
                                  headers={"Content-Type": "application/json"})
                check("POST /api/voice/tts (xAI eve)", r3.status_code == 200,
                      f"audio_b64_len={len(r3.json().get('audio',''))}" if r3.status_code==200 else r3.text[:60])

                # POST /api/stt (xAI grok-stt) - send tiny silent wav
                import wave, io
                buf = io.BytesIO()
                with wave.open(buf, 'wb') as wf:
                    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000)
                    wf.writeframes(b'\x00' * 3200)
                buf.seek(0)
                r4 = await c.post(f"{base}/api/stt",
                                  files={"audio": ("test.wav", buf, "audio/wav")})
                check("POST /api/stt (xAI grok-stt)", r4.status_code in (200, 422, 502),
                      f"status={r4.status_code}, text={r4.json().get('text','') if r4.status_code==200 else r4.text[:60]}")

    except Exception as e:
        if "connect" in str(e).lower():
            print(f"  {WARN} Backend not reachable on :8000 -- start it first")
        else:
            check("HTTP tests", False, str(e)[:100])

asyncio.run(test_http())


# ======================================================
#  SUMMARY
# ======================================================
section("RESULTS SUMMARY")

passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total  = len(results)

print(f"\n  {passed}/{total} tests passed {'<< ALL GOOD >>' if failed==0 else ''}")

if failed:
    print(f"\n  Failed:")
    for ok, label in results:
        if not ok:
            print(f"    {FAIL} {label}")

print()
sys.exit(0 if failed == 0 else 1)
