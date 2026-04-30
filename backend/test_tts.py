"""
Quick test — confirms ElevenLabs Tara voice is working and speaking English.
Saves audio to tara_test.mp3 — open it to hear the voice.

Run from backend/ folder:
    python test_tts.py
"""

import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = "rfh7WrTVqLIjVSioJwdI"   # Tara — Auto Sales
ELEVENLABS_MODEL    = "eleven_flash_v2_5"

# A typical Maya response — this is what gets sent to Tara in a real call
TEST_TEXT = (
    "Hello Priya, this is Maya calling from Škoda Auto India. "
    "As per our records, you were enquiring about the Škoda Kushaq. "
    "Is that correct, or were you looking at something else?"
)

async def test():
    if not ELEVENLABS_API_KEY:
        print("ERR  ELEVENLABS_API_KEY not set in backend/.env")
        return

    print(f"Calling ElevenLabs — voice: Tara ({ELEVENLABS_VOICE_ID}), model: {ELEVENLABS_MODEL}")
    print(f"Text: \"{TEST_TEXT}\"\n")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": TEST_TEXT,
                "model_id": ELEVENLABS_MODEL,
                "voice_settings": {
                    "stability": 0.45,
                    "similarity_boost": 0.80,
                    "style": 0.0,
                    "use_speaker_boost": True,
                },
            },
        )

    if response.status_code == 200:
        output_file = "tara_test.mp3"
        with open(output_file, "wb") as f:
            f.write(response.content)
        print(f"OK   Audio saved to: {output_file}  ({len(response.content):,} bytes)")
        print("     Open tara_test.mp3 to hear Tara speaking.")
        print("     Language: mirrors whatever text is sent (English text = English speech)")
    else:
        print(f"ERR  {response.status_code}: {response.text[:300]}")

asyncio.run(test())
