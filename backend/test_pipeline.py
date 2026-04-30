"""
End-to-end pipeline test: simulates a full Hindi + English call flow.
Tests: LLM response quality, language mirroring, TTS audio generation.

Run from backend/ folder:
    python test_pipeline.py
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from agent.llm_client import init_llm_backend, get_ai_response, tts
from agent.conversation import CallSession, process_customer_input

SAMPLE_LEAD = {
    "lead_id": "TEST-PIPELINE",
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

CALL_SCRIPT = [
    ("Yes, I have time",                    "en", "NAME_CONFIRM → GREETING"),
    ("Yes go ahead",                        "en", "GREETING → DISCOVERY"),
    ("han bolo",                            "hi", "Hindi: confirm interest"),
    ("Haan, Slavia Monte Carlo chahiye",    "hi", "Hinglish: model confirmation"),
    ("Budget around 15 lakh hai",           "hi", "Hinglish: budget"),
    ("Delhi mein hoon main",               "hi", "Hinglish: location"),
    ("Test drive kab le sakta hoon",        "hi", "Hinglish: next step"),
    ("Okay thanks, bye",                    "en", "Call ending"),
]


async def run_pipeline():
    print("=" * 60)
    print("PIPELINE TEST — Full call simulation")
    print("=" * 60)

    init_llm_backend()

    openai_key     = os.getenv("OPENAI_API_KEY", "").strip()
    xai_key        = os.getenv("XAI_API_KEY", "").strip()
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "").strip()

    print(f"  BRAIN primary : {'OK (OpenAI GPT-4o-mini)' if openai_key else 'MISSING OPENAI_API_KEY'}")
    print(f"  BRAIN fallback: {'OK (xAI Grok)' if xai_key else 'MISSING XAI_API_KEY'}")
    print(f"  STT           : {'OK (xAI grok-stt)' if xai_key else 'MISSING XAI_API_KEY'}")
    print(f"  TTS           : {'OK (ElevenLabs Tara)' if elevenlabs_key else 'MISSING ELEVENLABS_API_KEY'}")
    print()

    if not openai_key and not xai_key:
        print("ERR  Cannot run pipeline without OPENAI_API_KEY or XAI_API_KEY")
        sys.exit(1)

    session = CallSession(SAMPLE_LEAD, call_id="TEST-PIPE-001")
    turn_num = 0

    for customer_input, lang, description in CALL_SCRIPT:
        turn_num += 1
        print(f"Turn {turn_num}: {description}")
        print(f"  Customer [{lang.upper()}]: \"{customer_input}\"")

        try:
            result = await process_customer_input(session, customer_input)
            agent_text = result.get("agent_text", "")
            state = result.get("state", "")
            print(f"  Maya   [{state}]: \"{agent_text}\"")

            # Check language mirroring
            if lang == "hi":
                hindi_words = {"bilkul", "theek", "zaroor", "aap", "haan", "batao",
                               "bolo", "ji", "sahi", "accha", "iska", "woh", "mein",
                               "kripaya", "zaroor", "bahut", "aapka"}
                has_hindi = any(w in agent_text.lower() for w in hindi_words)
                has_devanagari = any('ऀ' <= c <= 'ॿ' for c in agent_text)
                if has_hindi or has_devanagari:
                    print(f"  PASS  Language mirroring: Hindi/Hinglish detected in response")
                else:
                    print(f"  WARN  Language mirroring: Response appears to be English-only")

            # Test TTS for this turn (first Hindi turn only, to save time)
            if lang == "hi" and turn_num == 3 and elevenlabs_key:
                print(f"  TTS  Testing ElevenLabs for this Hindi response...")
                audio = await tts(agent_text)
                if audio:
                    print(f"  PASS  TTS: {len(audio):,} bytes — ElevenLabs Tara OK")
                else:
                    print(f"  WARN  TTS: No audio returned")

            if result.get("call_ended"):
                print(f"\n  Call ended at turn {turn_num}.")
                break

        except Exception as e:
            print(f"  ERR   {e}")
            import traceback
            traceback.print_exc()

        print()

    print("=" * 60)
    print(f"Completed {turn_num} turns.")
    print(f"Final state: {session.state}")
    print(f"Transcript length: {len(session.transcript)} messages")


if __name__ == "__main__":
    asyncio.run(run_pipeline())
