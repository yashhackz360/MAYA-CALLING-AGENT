"""
twilio_handler.py — Twilio Programmable Voice webhook + Media Streams WebSocket.

Audio overlap fixes:
  1. Mark events   — Twilio tells us exactly when it finishes playing audio.
  2. Speaking lock — all customer audio is dropped while Maya is speaking.
  3. Cooldown      — 1.2s discard window after Mark fires (acoustic echo tail).
  4. VAD           — energy-based end-of-speech detection replaces fixed 400ms buffer.
"""

import asyncio
import base64
import json
import os
import time

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop  # Python 3.13+ backport

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response

from agent.conversation import process_customer_input
from agent.llm_client import deepgram_transcribe, tts_pcm_8k
from audio_bridge import mulaw_to_wav, pcm_to_mulaw
from call_manager.manager import end_call, get_session, initiate_call

router = APIRouter()

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")

# Maps Twilio CallSid → lead_id
_sid_to_lead: dict[str, str] = {}

# ── VAD / timing constants ───────────────────────────────────────────────────
# µ-law at 8kHz = 8000 bytes/second
MIN_SPEECH_BYTES = 8_000    # 1.0 s  — don't transcribe too early
MAX_SPEECH_BYTES = 64_000   # 8.0 s  — force transcribe after 8s
SILENCE_WINDOW   = 4_800    # 0.6 s  — inspect last 600ms for silence
SILENCE_RMS      = 400      # 16-bit PCM RMS below this = silence
LISTEN_COOLDOWN  = 1.2      # seconds after mark event before we listen again
# ────────────────────────────────────────────────────────────────────────────


def register_call(call_sid: str, lead_id: str) -> None:
    _sid_to_lead[call_sid] = lead_id


def _is_silent(mulaw_chunk: bytes) -> bool:
    """True if the µ-law chunk's RMS energy is below the speech threshold."""
    if len(mulaw_chunk) < 160:  # < 20ms — too short to judge
        return True
    pcm = audioop.ulaw2lin(mulaw_chunk, 2)
    return audioop.rms(pcm, 2) < SILENCE_RMS


@router.post("/twilio/voice")
async def twilio_voice_webhook(request: Request):
    """
    Twilio calls this when the outbound call is answered.
    Returns TwiML that opens a bidirectional Media Streams WebSocket.
    """
    from twilio.twiml.voice_response import Connect, VoiceResponse

    form = await request.form()
    call_sid = form.get("CallSid", "")
    host = PUBLIC_BASE_URL.replace("https://", "").replace("http://", "").rstrip("/")

    twiml = VoiceResponse()
    connect = Connect()
    connect.stream(url=f"wss://{host}/ws/twilio-stream/{call_sid}")
    twiml.append(connect)

    return Response(content=str(twiml), media_type="application/xml")


@router.websocket("/ws/twilio-stream/{call_sid}")
async def twilio_media_stream(websocket: WebSocket, call_sid: str):
    """
    Bidirectional audio loop with overlap prevention:
      - maya_speaking=True  → drop all incoming audio frames
      - After mark event    → LISTEN_COOLDOWN seconds of discard (echo tail)
      - VAD                 → only transcribe after silence is detected
    """
    await websocket.accept()

    session       = None
    stream_sid    = ""
    audio_buffer  = bytearray()

    maya_speaking  = False   # True while audio is queued/playing on Twilio
    listen_after   = 0.0     # monotonic time after which we start processing
    mark_seq       = 0       # unique mark name per send
    ending_call    = False   # True after call_ended — break only on next mark ACK

    try:
        async for raw in websocket.iter_text():
            msg   = json.loads(raw)
            event = msg.get("event")

            # ── Twilio handshake ──────────────────────────────────────────
            if event == "connected":
                pass

            # ── Stream started — initiate call session and play greeting ──
            elif event == "start":
                stream_sid = msg["start"]["streamSid"]
                lead_id    = _sid_to_lead.get(call_sid)
                if not lead_id:
                    print(f"[Twilio WS] No lead_id for CallSid={call_sid}")
                    continue

                result = initiate_call(lead_id)
                if "error" in result:
                    print(f"[Twilio WS] initiate_call error: {result['error']}")
                    continue

                session      = get_session(result["call_id"])
                opening_text = result.get("opening_message", "")
                print(f"[Twilio WS] Started call_id={result['call_id']} lead={lead_id}")

                if opening_text:
                    maya_speaking = True
                    audio = await tts_pcm_8k(opening_text)
                    if audio:
                        mark_seq += 1
                        await _send_audio(websocket, stream_sid,
                                          pcm_to_mulaw(audio), f"maya_{mark_seq}")
                    else:
                        maya_speaking = False

            # ── Mark ACK — Twilio finished playing up to this point ───────
            elif event == "mark":
                mark_name = msg.get("mark", {}).get("name", "")
                if mark_name.startswith("maya_"):
                    maya_speaking = False
                    if ending_call:
                        # Farewell audio finished — now safe to hang up
                        if session:
                            end_call(session.call_id)
                        print("[Twilio WS] Farewell audio complete -> ending call")
                        break
                    listen_after  = time.monotonic() + LISTEN_COOLDOWN
                    audio_buffer.clear()
                    print(f"[Twilio WS] Maya done -> cooldown {LISTEN_COOLDOWN}s")

            # ── Incoming customer audio ───────────────────────────────────
            elif event == "media":
                # Discard while Maya is speaking or during acoustic-echo cooldown
                if maya_speaking or time.monotonic() < listen_after:
                    audio_buffer.clear()
                    continue

                payload = base64.b64decode(msg["media"]["payload"])
                audio_buffer.extend(payload)

                buf_len = len(audio_buffer)
                if buf_len < MIN_SPEECH_BYTES:
                    continue  # too short — wait for more audio

                # End-of-speech: silence in last SILENCE_WINDOW bytes, or hard cap
                end_of_speech = (
                    _is_silent(bytes(audio_buffer[-SILENCE_WINDOW:]))
                    or buf_len >= MAX_SPEECH_BYTES
                )
                if not end_of_speech:
                    continue

                # Transcribe the accumulated utterance
                wav  = mulaw_to_wav(bytes(audio_buffer))
                audio_buffer.clear()

                text = await deepgram_transcribe(wav, "audio/wav")
                if not text or not text.strip():
                    continue

                print(f"[Twilio WS] STT: {text!r}")

                if not session:
                    continue

                result     = await process_customer_input(session, text)
                agent_text = result.get("agent_text", "")

                if agent_text:
                    maya_speaking = True
                    audio = await tts_pcm_8k(agent_text)
                    if audio:
                        mark_seq += 1
                        await _send_audio(websocket, stream_sid,
                                          pcm_to_mulaw(audio), f"maya_{mark_seq}")
                    else:
                        maya_speaking = False

                if result.get("call_ended"):
                    ending_call = True
                    # Don't break — wait for mark ACK so farewell audio finishes playing

            # ── Stream ended ──────────────────────────────────────────────
            elif event == "stop":
                print(f"[Twilio WS] Stream stopped CallSid={call_sid}")
                if session:
                    end_call(session.call_id)
                break

    except Exception as e:
        print(f"[Twilio WS] Error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


async def _send_audio(ws: WebSocket, stream_sid: str,
                      mulaw: bytes, mark_name: str = "") -> None:
    """Send µ-law audio to Twilio, then a mark so we know when playback ends."""
    await ws.send_json({
        "event":     "media",
        "streamSid": stream_sid,
        "media":     {"payload": base64.b64encode(mulaw).decode()},
    })
    if mark_name:
        await ws.send_json({
            "event":     "mark",
            "streamSid": stream_sid,
            "mark":      {"name": mark_name},
        })
