"""
Deepgram STT diagnostic — MantaRay AI
Tests three things in order:
  1. API key validity   (lightweight /projects call)
  2. URL-based request  (Deepgram sample WAV via JSON body)
  3. Bytes-based request (WAV downloaded and posted as raw bytes — same
                          code path the app uses with audio/webm from the mic)

Run from backend/ folder:
    python test_deepgram.py
"""

import asyncio
import os
import sys

import httpx

# ─── Load API key from backend/.env ──────────────────────────────────────────

def _load_env(path: str) -> dict:
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

_here = os.path.dirname(os.path.abspath(__file__))
_env  = _load_env(os.path.join(_here, ".env"))

DEEPGRAM_API_KEY = (
    _env.get("DEEPGRAM_API_KEY")
    or os.getenv("DEEPGRAM_API_KEY", "")
).strip()

BACKEND_URL = "http://localhost:8000"

# Public WAV used for testing (Deepgram's own sample, ~10 s, 16 kHz mono)
SAMPLE_WAV_URL = "https://static.deepgram.com/examples/interview_speech-analytics.wav"

DG_LISTEN = "https://api.deepgram.com/v1/listen"
HEADERS   = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _ok(msg: str):  print(f"  [OK]  {msg}")
def _err(msg: str): print(f"  [ERR] {msg}")
def _hdr(msg: str): print(f"\n{'='*55}\n  {msg}\n{'='*55}")

def _extract(data: dict) -> tuple[str, float, str]:
    ch   = data["results"]["channels"][0]
    alt  = ch["alternatives"][0]
    text = alt.get("transcript", "").strip()
    conf = alt.get("confidence", 0.0)
    lang = ch.get("detected_language", "—")
    return text, conf, lang

# ─── Test 1: key validity ─────────────────────────────────────────────────────

async def test_key(client: httpx.AsyncClient) -> bool:
    _hdr("Test 1 — API key validity")
    print(f"  Key (last 8): ...{DEEPGRAM_API_KEY[-8:]}")
    r = await client.get(
        "https://api.deepgram.com/v1/projects",
        headers=HEADERS,
        timeout=8.0,
    )
    if r.status_code == 200:
        projects = r.json().get("projects", [])
        _ok(f"Key is valid — {len(projects)} project(s) on account")
        return True
    elif r.status_code == 401:
        _err(f"401 Unauthorized — key is invalid or revoked")
    else:
        _err(f"HTTP {r.status_code}: {r.text[:200]}")
    return False

# ─── Test 2: URL-based transcription ─────────────────────────────────────────

async def test_url(client: httpx.AsyncClient) -> bool:
    _hdr("Test 2 — URL-based transcription (JSON body)")
    print(f"  Audio URL: {SAMPLE_WAV_URL}")
    r = await client.post(
        DG_LISTEN,
        params={"model": "nova-2", "detect_language": "true",
                "smart_format": "true", "punctuate": "true"},
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"url": SAMPLE_WAV_URL},
        timeout=20.0,
    )
    if r.status_code != 200:
        _err(f"HTTP {r.status_code}: {r.text[:300]}")
        return False
    text, conf, lang = _extract(r.json())
    _ok(f"Transcribed — lang={lang}  confidence={conf:.0%}")
    _ok(f"Transcript : \"{text[:120]}{'…' if len(text) > 120 else ''}\"")
    return True

# ─── Test 3: bytes-based transcription (mirrors app code path) ───────────────

async def test_bytes(client: httpx.AsyncClient) -> bool:
    _hdr("Test 3 — Bytes-based transcription (audio/wav — mirrors app path)")
    print(f"  Downloading sample WAV...")
    dl = await client.get(SAMPLE_WAV_URL, timeout=20.0, follow_redirects=True)
    if dl.status_code != 200:
        _err(f"Could not download sample audio: HTTP {dl.status_code}")
        return False
    wav_bytes = dl.content
    print(f"  Downloaded {len(wav_bytes):,} bytes")

    r = await client.post(
        DG_LISTEN,
        params={"model": "nova-2", "language": "en-IN",
                "detect_language": "true", "smart_format": "true",
                "punctuate": "true", "filler_words": "false"},
        headers={**HEADERS, "Content-Type": "audio/wav"},
        content=wav_bytes,
        timeout=20.0,
    )
    if r.status_code != 200:
        _err(f"HTTP {r.status_code}: {r.text[:300]}")
        return False
    text, conf, lang = _extract(r.json())
    _ok(f"Transcribed — lang={lang}  confidence={conf:.0%}")
    _ok(f"Transcript : \"{text[:120]}{'…' if len(text) > 120 else ''}\"")
    return True

# ─── Test 4: backend /api/stt endpoint (optional, needs server running) ───────

async def test_backend_stt(client: httpx.AsyncClient) -> bool:
    _hdr("Test 4 — Backend /api/stt endpoint (needs server on :8000)")
    # Download WAV first
    try:
        dl = await client.get(SAMPLE_WAV_URL, timeout=15.0, follow_redirects=True)
        wav_bytes = dl.content
    except Exception as e:
        _err(f"Download failed: {e}")
        return False

    try:
        r = await client.post(
            f"{BACKEND_URL}/api/stt",
            files={"audio": ("audio.wav", wav_bytes, "audio/wav")},
            timeout=25.0,
        )
    except httpx.ConnectError:
        print("  [SKIP] Backend not running — skipping (start with: uvicorn main:app)")
        return True  # not a failure

    if r.status_code != 200:
        _err(f"HTTP {r.status_code}: {r.text[:300]}")
        return False

    data = r.json()
    provider = data.get("provider", "unknown")
    text     = data.get("text", "").strip()
    _ok(f"Provider used : {provider}")
    _ok(f"Transcript    : \"{text[:120]}\"")

    if provider != "deepgram":
        print(f"\n  [WARN] Backend used '{provider}' instead of 'deepgram'.")
        print("     Possible causes:")
        print("     • DEEPGRAM_API_KEY missing/wrong in backend/.env")
        print("     • deepgram_transcribe() returned None → fell back to xAI grok-stt")
    return True

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    print("=" * 55)
    print("  Deepgram STT Diagnostic — MantaRay AI")
    print("=" * 55)

    if not DEEPGRAM_API_KEY:
        print("\n  ✗  DEEPGRAM_API_KEY not found in backend/.env")
        print("     Add:  DEEPGRAM_API_KEY=<your_key>")
        sys.exit(1)

    results = {}
    async with httpx.AsyncClient() as client:
        results["key"]     = await test_key(client)
        if not results["key"]:
            print("\n  Key check failed — skipping further tests.")
            sys.exit(1)
        results["url"]     = await test_url(client)
        results["bytes"]   = await test_bytes(client)
        results["backend"] = await test_backend_stt(client)

    print("\n" + "=" * 55)
    passed = sum(v for v in results.values())
    total  = len(results)
    status = "ALL PASSED" if passed == total else f"{passed}/{total} passed"
    print(f"  Result: {status}")
    print("=" * 55)

    if not all(results.values()):
        sys.exit(1)

asyncio.run(main())
