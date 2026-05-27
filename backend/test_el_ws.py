"""
test_el_ws.py — Deep ElevenLabs agent troubleshooting
Tests: connection, metadata, first message, user audio, full conversation loop
Usage:  cd backend && python test_el_ws.py
"""
import asyncio
import base64
import json
import math
import os
import struct
import sys
import io
import traceback

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop

ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")

LINE = "=" * 60
print(f"\n{LINE}")
print("  ElevenLabs Agent — Deep Troubleshoot")
print(LINE)
print(f"  API Key : {ELEVENLABS_API_KEY[:20]}...")
print(f"  Agent   : {ELEVENLABS_AGENT_ID}")


def make_pcm_16k_speech_like(duration_ms=500):
    """Generate a 500ms pseudo-speech sine tone at 300Hz (voice fundamental)
    encoded as 16-bit PCM 16kHz — simulates a human voice utterance."""
    rate = 16000
    n = int(rate * duration_ms / 1000)
    # Mix two sine waves (300Hz + 700Hz) to mimic voice formants
    samples = []
    for i in range(n):
        t = i / rate
        v = 0.4 * math.sin(2 * math.pi * 300 * t) + 0.3 * math.sin(2 * math.pi * 700 * t)
        samples.append(int(v * 32767))
    return struct.pack(f"<{n}h", *samples)


def make_mulaw_8k_speech_like(duration_ms=500):
    """Same but encoded as µ-law 8kHz (what Twilio sends)."""
    pcm16k = make_pcm_16k_speech_like(duration_ms)
    pcm8k, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)
    return audioop.lin2ulaw(pcm8k, 2)


async def run():
    import websockets
    print(f"  websockets: {websockets.__version__}\n")

    url = f"wss://api.elevenlabs.io/v1/convai/conversation?agent_id={ELEVENLABS_AGENT_ID}"

    try:
        async with websockets.connect(
            url,
            additional_headers={"xi-api-key": ELEVENLABS_API_KEY},
            ping_interval=None,
            open_timeout=15,
        ) as ws:
            print("[OK] Connected to ElevenLabs\n")

            # ── Step 1: Full metadata dump ────────────────────────────────────────
            print("--- Step 1: Receive conversation_initiation_metadata ---")
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
                meta = json.loads(raw)
                print(f"  type         : {meta.get('type')}")
                ev = meta.get("conversation_initiation_metadata_event", {})
                print(f"  conversation_id          : {ev.get('conversation_id')}")
                print(f"  agent_output_audio_format: {ev.get('agent_output_audio_format')}")
                print(f"  FULL metadata_event keys : {list(ev.keys())}")
                print(f"  FULL metadata keys       : {list(meta.keys())}")
                print(f"  Raw (first 400 chars)    : {raw[:400]}")
                output_fmt = ev.get("agent_output_audio_format", "pcm_16000")
            except asyncio.TimeoutError:
                print("[FAIL] Timeout waiting for metadata")
                return
            except Exception as e:
                print(f"[FAIL] Metadata error: {e}")
                traceback.print_exc()
                return

            # ── Step 2: Send config override ──────────────────────────────────────
            print("\n--- Step 2: Send conversation_initiation_client_data ---")
            await ws.send(json.dumps({
                "type": "conversation_initiation_client_data",
                "conversation_config_override": {
                    "agent": {
                        "first_message": "Hello! Please say something so we can test your microphone."
                    }
                }
            }))
            print("  [OK] Sent override")

            # ── Step 3: Receive first message audio (drain all chunks) ─────────────
            print("\n--- Step 3: Wait for agent first message ---")
            got_audio = False
            got_agent_response = False
            audio_chunks = 0
            deadline = asyncio.get_event_loop().time() + 15
            while asyncio.get_event_loop().time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                except asyncio.TimeoutError:
                    if got_audio:
                        break
                    continue
                msg = json.loads(raw) if isinstance(raw, (str, bytes)) else {}
                t = msg.get("type", "")
                if t == "audio":
                    audio_chunks += 1
                    got_audio = True
                    b64 = (msg.get("audio_event", {}).get("audio_base_64") or
                           msg.get("audio", {}).get("chunk", ""))
                    print(f"  [AUDIO chunk {audio_chunks}] {output_fmt} bytes~{len(b64)*3//4}")
                elif t == "agent_response":
                    text = msg.get("agent_response_event", {}).get("agent_response", "")
                    print(f"  [AGENT RESPONSE] {text!r}")
                    got_agent_response = True
                elif t == "ping":
                    await ws.send(json.dumps({"type": "pong", "event_id": msg.get("ping_event", {}).get("event_id")}))
                else:
                    print(f"  [MSG type={t!r}] {raw[:120]}")

            if got_audio:
                print(f"\n[OK] Agent sent {audio_chunks} audio chunk(s) — output format={output_fmt}")
            else:
                print("\n[FAIL] Agent sent NO audio for the first message!")
                return

            # ── Step 4: Send user audio (PCM 16kHz) ───────────────────────────────
            print("\n--- Step 4: Send user speech as PCM 16kHz ---")
            pcm16k = make_pcm_16k_speech_like(800)
            b64_pcm = base64.b64encode(pcm16k).decode()
            for _ in range(5):   # send 5 x 800ms = 4 seconds of speech
                await ws.send(json.dumps({"user_audio_chunk": b64_pcm}))
            print(f"  [OK] Sent 5 x 800ms PCM 16kHz chunks ({len(b64_pcm)} b64 chars each)")

            # ── Step 5: Listen for user_transcript / agent_response ───────────────
            print("\n--- Step 5: Wait for ElevenLabs reaction (15s) ---")
            saw_transcript = False
            saw_response   = False
            saw_user_audio_ack = False
            deadline2 = asyncio.get_event_loop().time() + 15
            msgs_seen = []
            while asyncio.get_event_loop().time() < deadline2:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                except asyncio.TimeoutError:
                    if saw_transcript or saw_response:
                        break
                    continue
                msg = json.loads(raw) if isinstance(raw, (str, bytes)) else {}
                t = msg.get("type", "")
                msgs_seen.append(t)
                if t == "user_transcript":
                    txt = msg.get("user_transcription_event", {}).get("user_transcript", "")
                    print(f"  [USER TRANSCRIPT] {txt!r}")
                    saw_transcript = True
                elif t == "agent_response":
                    txt = msg.get("agent_response_event", {}).get("agent_response", "")
                    print(f"  [AGENT RESPONSE] {txt!r}")
                    saw_response = True
                elif t == "audio":
                    b64 = (msg.get("audio_event", {}).get("audio_base_64") or
                           msg.get("audio", {}).get("chunk", ""))
                    print(f"  [AGENT AUDIO] bytes~{len(b64)*3//4}")
                elif t == "ping":
                    await ws.send(json.dumps({"type": "pong", "event_id": msg.get("ping_event", {}).get("event_id")}))
                elif t == "interruption":
                    print(f"  [INTERRUPTION] (agent detected user speech!)")
                    saw_user_audio_ack = True
                else:
                    print(f"  [MSG type={t!r}] {str(msg)[:100]}")

            print(f"\n  All message types seen: {msgs_seen}")
            print()
            if saw_transcript:
                print("[OK] ElevenLabs transcribed the test audio (STT is working!)")
            else:
                print("[FAIL] ElevenLabs did NOT transcribe our audio")
                print("       -> Input audio format mismatch or audio too quiet")
                print("       -> The agent's STT is not receiving/processing our audio")

            if saw_response:
                print("[OK] Agent generated a response (LLM is working!)")
            else:
                print("[FAIL] Agent did NOT generate a response")

            if saw_user_audio_ack:
                print("[OK] ElevenLabs sent interruption (it heard the user!)")

            # ── Step 6: Also try sending raw µ-law ───────────────────────────────
            print("\n--- Step 6: Re-test with raw µ-law 8kHz (Twilio format) ---")
            mulaw = make_mulaw_8k_speech_like(800)
            b64_ulaw = base64.b64encode(mulaw).decode()
            for _ in range(5):
                await ws.send(json.dumps({"user_audio_chunk": b64_ulaw}))
            print(f"  [OK] Sent 5 x 800ms µ-law 8kHz chunks ({len(b64_ulaw)} b64 chars each)")
            print("  Waiting 5s for reaction...")
            msgs2 = []
            deadline3 = asyncio.get_event_loop().time() + 5
            while asyncio.get_event_loop().time() < deadline3:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                msg = json.loads(raw) if isinstance(raw, (str, bytes)) else {}
                t = msg.get("type", "")
                msgs2.append(t)
                if t == "user_transcript":
                    txt = msg.get("user_transcription_event", {}).get("user_transcript", "")
                    print(f"  [USER TRANSCRIPT with µ-law] {txt!r}")
                elif t == "ping":
                    await ws.send(json.dumps({"type": "pong", "event_id": msg.get("ping_event", {}).get("event_id")}))
                else:
                    print(f"  [MSG type={t!r}]")
            print(f"  µ-law message types: {msgs2}")

            await ws.close()
            print("\n[OK] Connection closed\n")

    except Exception as e:
        print(f"\n[FAIL] {type(e).__name__}: {e}")
        traceback.print_exc()


asyncio.run(run())
print(LINE + "\n")
