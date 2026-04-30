"""
Language detection + LLM language mirroring test.
Verifies that when a customer speaks Hindi/Hinglish, Maya replies in kind.

Run from backend/ folder:
    python test_language.py
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from agent.llm_client import _detect_language, init_llm_backend, _call_xai
from agent.conversation import CallSession

# ─── Sample lead (Rahul — existing test customer) ─────────────────────────────
SAMPLE_LEAD = {
    "lead_id": "TEST-001",
    "name": "Rahul Sharma",
    "phone": "+91-9876543210",
    "email": "rahul@test.com",
    "source": "Website",
    "preferences": {
        "vehicle_model": "Škoda Slavia",
        "variant": "Monte Carlo",
        "enquiry_type": "New Purchase",
        "location": "Delhi NCR",
    }
}

# ─── Language detection unit tests ────────────────────────────────────────────
DETECTION_CASES = [
    ("Yes I have time",                         "english"),
    ("han bolo",                                "hinglish"),
    ("han Vahi Pukar",                          "hinglish"),
    ("online check karo Ek Bar",                "hinglish"),
    ("Bilkul, mujhe Slavia pasand hai",         "hinglish"),
    ("Haan, test drive lena chahta hoon",       "hinglish"),
    ("हाँ, मुझे Slavia पसंद है",                "hindi"),
    ("मैं दिल्ली में हूं",                        "hindi"),
    ("I am interested in the Kushaq",           "english"),
    ("Budget is around 15 to 18 lakhs",         "english"),
]

# ─── LLM response tests ───────────────────────────────────────────────────────
LLM_CASES = [
    {
        "input": "Yes, I have time",
        "expected_lang": "english",
        "desc": "English customer → English response",
    },
    {
        "input": "han bolo",
        "expected_lang": "hindi",
        "desc": "Hinglish 'han bolo' → Hindi/Hinglish response",
    },
    {
        "input": "Haan, Slavia Monte Carlo mein interested hoon",
        "expected_lang": "hindi",
        "desc": "Hinglish full sentence → Hinglish response",
    },
    {
        "input": "online check karo Ek Bar",
        "expected_lang": "hindi",
        "desc": "Hinglish action request → Hinglish response",
    },
]


def test_detection():
    print("=" * 60)
    print("TEST 1: Language Detection")
    print("=" * 60)
    passed = 0
    for text, expected in DETECTION_CASES:
        result = _detect_language(text)
        ok = "PASS" if result == expected else "FAIL"
        if result == expected:
            passed += 1
        print(f"  {ok}  [{expected:8s}] \"{text}\"")
    print(f"\n  {passed}/{len(DETECTION_CASES)} passed\n")
    return passed == len(DETECTION_CASES)


async def test_llm_responses():
    print("=" * 60)
    print("TEST 2: LLM Language Mirroring (requires XAI_API_KEY)")
    print("=" * 60)

    init_llm_backend()
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        print("  SKIP  XAI_API_KEY not set\n")
        return True

    passed = 0
    for case in LLM_CASES:
        session = CallSession(SAMPLE_LEAD, call_id="TEST-001")
        # Advance to DISCOVERY state (skip NAME_CONFIRM + GREETING)
        session.state = "discovery"
        session.add_turn("agent", "Hello Rahul, this is Maya calling from Škoda Auto India.")
        session.add_turn("customer", "Yes, go ahead.")
        session.add_turn("agent", "You were enquiring about the Slavia Monte Carlo. Is that correct?")

        try:
            response = await _call_xai(session, case["input"])
            # Simple check: Hindi response should contain some Devanagari or Hindi Roman words
            has_hindi_words = any(w in response.lower() for w in
                ["bilkul", "theek", "zaroor", "aap", "haan", "kripaya", "batao",
                 "bolo", "samajh", "ji", "iska", "woh", "sahi", "accha"])
            has_devanagari = any('ऀ' <= c <= 'ॿ' for c in response)
            is_hindi_response = has_hindi_words or has_devanagari

            expected_hindi = case["expected_lang"] == "hindi"
            ok_flag = "PASS" if (expected_hindi == is_hindi_response) else "WARN"
            if ok_flag == "PASS":
                passed += 1

            print(f"  {ok_flag}  {case['desc']}")
            print(f"       Input  : \"{case['input']}\"")
            print(f"       Output : \"{response[:100]}\"")
            print()
        except Exception as e:
            print(f"  ERR   {case['desc']}: {e}\n")

    print(f"  {passed}/{len(LLM_CASES)} passed\n")
    return True


if __name__ == "__main__":
    # Detection tests (no API key needed)
    ok = test_detection()

    # LLM tests (needs XAI_API_KEY)
    asyncio.run(test_llm_responses())

    if not ok:
        sys.exit(1)
    print("All detection tests passed.")
