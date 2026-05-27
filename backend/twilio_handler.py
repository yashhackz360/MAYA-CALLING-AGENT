"""
twilio_handler.py — Twilio <-> ElevenLabs Conversational AI audio relay.

Flow:
  1. Accept Twilio WebSocket
  2. Read "start" event -> get stream_sid (before EL connects, avoids race)
  3. Connect to ElevenLabs
  4. Receive conversation_initiation_metadata
  5. Send override: Tara voice + language-specific first_message + system prompt
  6. Run bidirectional audio relay, collecting transcript turns
  7. Detect goodbye phrase -> hang up via Twilio REST API
  8. Save call log on close, fire background post-call analysis

Post-call analysis (background task):
  - Fetch Twilio call recording SID (polls with retries ~30-90s delay)
  - Send transcript to xAI Grok for business metric extraction
    (engagability, Hot/Warm/Cold category, worth pursuing, key insights)
  - Update call log entry and lead record with results

Audio path:
  Twilio µ-law 8kHz -> PCM 16kHz (upsample) -> ElevenLabs (user_audio_chunk)
  ElevenLabs PCM 16kHz -> µ-law 8kHz (downsample) -> Twilio media event
"""

import asyncio
import base64
import json
import logging
import os
import time
import traceback
from datetime import datetime

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop

import httpx
import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosed
from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response

router = APIRouter()

# ── File logger ───────────────────────────────────────────────────────────────
_LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "twilio_relay.log")
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(_LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger("relay")

_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

def _read_env(key: str) -> str:
    try:
        with open(_ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}=") and not line.startswith("#"):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.getenv(key, "")

def _public_url() -> str:
    val = _read_env("PUBLIC_BASE_URL")
    log.info(f"[URL] {val}")
    return val

# Maps Twilio CallSid -> lead_id
_sid_to_lead: dict[str, str] = {}

def register_call(call_sid: str, lead_id: str) -> None:
    _sid_to_lead[call_sid] = lead_id

# ── Voice configuration ───────────────────────────────────────────────────────
TARA_VOICE_ID = "rfh7WrTVqLIjVSioJwdI"

# ── Goodbye detection ─────────────────────────────────────────────────────────
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

def _is_goodbye(text: str, language: str) -> bool:
    lower   = text.lower()
    phrases = _GOODBYE_HI if language == "hindi" else _GOODBYE_EN
    return any(p in lower for p in phrases)


def _build_first_message(name: str, language: str) -> str:
    if language == "hindi":
        return (
            f"Namaste {name} ji, main Maya bol rahi hoon Skoda Auto India se."
        )
    return (
        f"Hello {name}, this is Maya calling from Skoda Auto India."
    )


def _build_dynamic_variables(lead: dict) -> list[dict]:
    """Return ElevenLabs dynamic variable pairs from lead enquiry data.
    These map to {{placeholder}} tokens in the ElevenLabs agent system prompt."""
    if not lead:
        return []

    prefs = lead.get("preferences", {}) or {}

    vehicle_parts = [prefs.get("vehicle_model", ""), prefs.get("variant", "")]
    vehicle = " ".join(p for p in vehicle_parts if p) or "a Škoda vehicle"

    notes = prefs.get("notes", "")
    if lead.get("enquiry_count", 1) > 1:
        notes = f"[Returning customer — enquiry #{lead['enquiry_count']}] " + notes

    return [
        {"name": "customer_name",    "value": lead.get("name", "there")},
        {"name": "vehicle_interest", "value": vehicle},
        {"name": "budget",           "value": prefs.get("budget", "not specified")},
        {"name": "transmission",     "value": prefs.get("transmission", "not specified")},
        {"name": "location",         "value": prefs.get("location", "not specified")},
        {"name": "enquiry_type",     "value": prefs.get("enquiry_type", "New Purchase")},
        {"name": "purpose",          "value": prefs.get("purpose", "")},
        {"name": "lead_tag",         "value": lead.get("tag", "Warm")},
        {"name": "notes",            "value": notes[:300] if notes else "No additional notes"},
    ]


# ── Post-call helpers ─────────────────────────────────────────────────────────

async def _fetch_recording_sid(call_sid: str) -> str:
    """Poll Twilio until a recording appears for this call (takes 30-90s to process)."""
    twilio_sid   = _read_env("TWILIO_ACCOUNT_SID")
    twilio_token = _read_env("TWILIO_AUTH_TOKEN")
    if not twilio_sid or not twilio_token:
        return ""

    from twilio.rest import Client
    loop = asyncio.get_event_loop()

    for attempt in range(5):
        wait = 20 if attempt == 0 else 15
        await asyncio.sleep(wait)
        try:
            recordings = await loop.run_in_executor(
                None,
                lambda: Client(twilio_sid, twilio_token).calls(call_sid).recordings.list()
            )
            if recordings:
                rsid = recordings[0].sid
                log.info(f"[Recording] Found SID={rsid} for call={call_sid} (attempt {attempt+1})")
                return rsid
        except Exception as e:
            log.warning(f"[Recording] Attempt {attempt+1} failed: {e}")

    log.warning(f"[Recording] No recording found for {call_sid} after 5 attempts")
    return ""


async def _analyze_transcript(transcript: list[dict], customer_name: str) -> dict:
    """Send call transcript to xAI Grok and return structured business metrics."""
    xai_key = _read_env("XAI_API_KEY")
    if not xai_key or not transcript:
        return {}

    turns = "\n".join(
        f"{'MAYA (Agent)' if t['role'] == 'agent' else f'CUSTOMER ({customer_name})'}: {t['text']}"
        for t in transcript
    )

    prompt = f"""You are analyzing a Škoda Auto India sales call transcript. Extract structured business metrics.

TRANSCRIPT:
{turns}

Respond with ONLY valid JSON — no markdown, no code fences, no explanation:
{{
  "engagability": "Very High" or "High" or "Medium" or "Low",
  "category": "Hot" or "Warm" or "Cold",
  "worth_pursuing": true or false,
  "purchase_intent": "High" or "Medium" or "Low" or "None",
  "conclusion": "1-2 sentence outcome summary of the call",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "next_action": "specific recommended next step for the sales team"
}}

Classification guidelines:
- Hot = ready to buy, test drive booked, strong positive signals, clear purchase intent
- Warm = interested but needs more info, comparing options, considering timeline
- Cold = not interested, wrong timing, browsing only, or did not engage
- Engagability = how responsive, cooperative, and engaged the customer was during the call
- worth_pursuing = true if there is any realistic chance of conversion"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.x.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {xai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "grok-3",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
            # Strip markdown fences if Grok wraps the response
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
            return json.loads(content)
    except json.JSONDecodeError as e:
        log.error(f"[Analysis] Grok returned invalid JSON: {e}")
        return {}
    except Exception as e:
        log.error(f"[Analysis] Grok error: {type(e).__name__}: {e}")
        return {}


async def _post_call_analysis(
    call_sid: str,
    lead_id: str,
    transcript: list[dict],
    customer_name: str,
) -> None:
    """Background task: fetch recording + analyze transcript, then update store."""
    log.info(f"[PostCall] Starting for call={call_sid} lead={lead_id} turns={len(transcript)}")

    # Run recording fetch and transcript analysis concurrently
    recording_task = asyncio.create_task(_fetch_recording_sid(call_sid))
    analysis_task  = asyncio.create_task(_analyze_transcript(transcript, customer_name))

    results = await asyncio.gather(recording_task, analysis_task, return_exceptions=True)
    recording_sid = results[0] if not isinstance(results[0], Exception) else ""
    ai_analysis   = results[1] if not isinstance(results[1], Exception) else {}

    if isinstance(results[0], Exception):
        log.error(f"[PostCall] Recording fetch error: {results[0]}")
    if isinstance(results[1], Exception):
        log.error(f"[PostCall] Analysis error: {results[1]}")

    # Update call log entry in-place
    patch: dict = {}
    if recording_sid:
        patch["recording_sid"] = recording_sid
    if ai_analysis:
        patch["ai_analysis"] = ai_analysis
        if ai_analysis.get("conclusion"):
            patch["outcome"] = ai_analysis["conclusion"]

    if patch:
        try:
            from data.sample_leads import update_call_log
            update_call_log(call_sid, patch)
            log.info(f"[PostCall] Call log updated — recording={recording_sid!r}")
        except Exception as e:
            log.error(f"[PostCall] Call log update error: {e}")

    # Update lead with AI-derived metrics
    if ai_analysis and lead_id != "unknown":
        try:
            from data.sample_leads import update_lead
            lead_patch: dict = {"ai_analysis": ai_analysis}
            if ai_analysis.get("engagability"):
                lead_patch["engagability"] = ai_analysis["engagability"]
            if ai_analysis.get("category"):
                lead_patch["tag"] = ai_analysis["category"]
            if ai_analysis.get("next_action"):
                lead_patch["next_action"] = ai_analysis["next_action"]
            if ai_analysis.get("purchase_intent"):
                lead_patch["intent"] = ai_analysis["purchase_intent"]
            update_lead(lead_id, lead_patch)
            log.info(
                f"[PostCall] Lead {lead_id} updated — "
                f"tag={ai_analysis.get('category')} "
                f"engagability={ai_analysis.get('engagability')} "
                f"worth_pursuing={ai_analysis.get('worth_pursuing')}"
            )
        except Exception as e:
            log.error(f"[PostCall] Lead update error: {e}")

    log.info(f"[PostCall] Complete — recording={bool(recording_sid)} analysis={bool(ai_analysis)}")


async def _hangup_twilio_call(call_sid: str) -> None:
    """End the Twilio call via REST API after goodbye audio plays."""
    try:
        twilio_sid   = _read_env("TWILIO_ACCOUNT_SID")
        twilio_token = _read_env("TWILIO_AUTH_TOKEN")
        if not twilio_sid or not twilio_token:
            log.warning("[Hangup] Missing Twilio credentials — skipping auto-hangup")
            return
        from twilio.rest import Client
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: Client(twilio_sid, twilio_token).calls(call_sid).update(status="completed")
        )
        log.info(f"[Hangup] Call {call_sid} ended via Twilio REST API")
    except Exception as e:
        log.error(f"[Hangup] Failed to hang up {call_sid}: {e}")


# ── Twilio voice webhook ──────────────────────────────────────────────────────

@router.post("/twilio/voice")
async def twilio_voice_webhook(request: Request):
    """Twilio calls this when the outbound call is answered."""
    try:
        from twilio.twiml.voice_response import Connect, VoiceResponse

        form        = await request.form()
        call_sid    = form.get("CallSid",    "unknown")
        call_status = form.get("CallStatus", "unknown")
        log.info(f"[Webhook] POST /twilio/voice — CallSid={call_sid} Status={call_status}")

        base_url = _public_url()
        if not base_url:
            log.error("[Webhook] PUBLIC_BASE_URL empty — returning error TwiML")
            return Response(
                content="<?xml version='1.0'?><Response><Say>Configuration error.</Say></Response>",
                media_type="application/xml", status_code=200,
            )

        host   = base_url.replace("https://", "").replace("http://", "").rstrip("/")
        ws_url = f"wss://{host}/ws/twilio-stream/{call_sid}"
        log.info(f"[Webhook] Stream URL: {ws_url}")

        twiml   = VoiceResponse()
        connect = Connect()
        connect.stream(url=ws_url)
        twiml.append(connect)
        return Response(content=str(twiml), media_type="application/xml")

    except Exception:
        log.error("[Webhook] FATAL:\n" + traceback.format_exc())
        return Response(
            content="<?xml version='1.0'?><Response><Say>Technical error. Please try again.</Say></Response>",
            media_type="application/xml", status_code=200,
        )


# ── WebSocket relay ───────────────────────────────────────────────────────────

@router.websocket("/ws/twilio-stream/{call_sid}")
async def twilio_media_stream(websocket: WebSocket, call_sid: str):
    """Bidirectional relay: Twilio Media Stream <-> ElevenLabs Conversational Agent."""
    await websocket.accept()
    call_start = time.time()
    log.info(f"[WS] Accepted — call_sid={call_sid}")

    # Live transcript — populated by elevenlabs_to_twilio inner function
    transcript: list[dict] = []

    # Resolve lead info
    lead_id            = _sid_to_lead.get(call_sid, "unknown")
    customer_name      = "there"
    preferred_language = "english"
    customer_phone     = ""
    lead_record        = None

    try:
        from data.sample_leads import get_lead
        lead_record = get_lead(lead_id)
        if lead_record:
            if lead_record.get("name"):
                customer_name = lead_record["name"].split()[0]
            preferred_language = (lead_record.get("preferred_language") or "english").lower()
            customer_phone     = lead_record.get("phone", "")
    except Exception:
        pass

    el_api_key  = _read_env("ELEVENLABS_API_KEY")
    el_agent_id = _read_env("ELEVENLABS_AGENT_ID")

    if not el_agent_id or not el_api_key:
        log.error("[WS] Missing ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY — closing")
        await websocket.close(code=1011)
        return

    # ── Step 1: Wait for Twilio "start" event ────────────────────────────────
    stream_sid = ""
    try:
        log.info("[WS] Waiting for Twilio 'start' event…")
        while True:
            raw   = await asyncio.wait_for(websocket.receive_text(), timeout=8.0)
            msg   = json.loads(raw)
            event = msg.get("event")
            if event == "connected":
                log.info("[WS] Twilio 'connected' event")
            elif event == "start":
                stream_sid = msg["start"]["streamSid"]
                log.info(f"[WS] Twilio 'start' — streamSid={stream_sid}")
                break
            else:
                log.debug(f"[WS] Pre-start event: {event}")
    except asyncio.TimeoutError:
        log.warning("[WS] Timeout waiting for 'start' — proceeding without streamSid")
    except Exception as e:
        log.error(f"[WS] Error reading start event: {e}")

    # ── Step 2: Connect to ElevenLabs ────────────────────────────────────────
    el_ws_url = f"wss://api.elevenlabs.io/v1/convai/conversation?agent_id={el_agent_id}"
    log.info(f"[EL] Connecting — agent={el_agent_id[:24]} lang={preferred_language}")

    try:
        async with websockets.connect(
            el_ws_url,
            additional_headers={"xi-api-key": el_api_key},
            ping_interval=None,
            open_timeout=15,
        ) as el_ws:
            log.info("[EL] Connected")

            # ── Step 3: Receive conversation_initiation_metadata ──────────────
            output_fmt = "pcm_16000"
            try:
                raw_meta = await asyncio.wait_for(el_ws.recv(), timeout=10.0)
                meta     = json.loads(raw_meta)
                log.info(f"[EL] Metadata: {raw_meta}")
                if meta.get("type") == "conversation_initiation_metadata":
                    ev         = meta.get("conversation_initiation_metadata_event", {})
                    output_fmt = ev.get("agent_output_audio_format", "pcm_16000")
                    log.info(f"[EL] output_fmt={output_fmt}  conv_id={ev.get('conversation_id')}")
            except asyncio.TimeoutError:
                log.warning("[EL] Metadata timeout — continuing with defaults")
            except Exception as e:
                log.error(f"[EL] Metadata error: {e}")

            # ── Step 4: Send per-call config override ─────────────────────────
            first_msg      = _build_first_message(customer_name, preferred_language)
            dyn_variables  = _build_dynamic_variables(lead_record)

            agent_override = {"first_message": first_msg}
            if dyn_variables:
                agent_override["prompt"] = {"variables": dyn_variables}

            override = {
                "type": "conversation_initiation_client_data",
                "conversation_config_override": {
                    "agent": agent_override,
                    "tts": {"voice_id": TARA_VOICE_ID},
                },
            }
            await el_ws.send(json.dumps(override))
            log.info(
                f"[EL] Sent override — customer={customer_name} "
                f"lang={preferred_language} voice={TARA_VOICE_ID} "
                f"variables={len(dyn_variables)}"
            )

            # ── Step 5: Bidirectional relay ───────────────────────────────────
            twilio_pkt_count = 0
            el_send_count    = 0
            el_audio_count   = 0
            goodbye_detected = False

            async def twilio_to_elevenlabs():
                nonlocal twilio_pkt_count, el_send_count
                pcm_buf        = bytearray()
                packets        = 0
                upsample_state = None
                BUFFER_PACKETS = 3  # 60ms

                try:
                    async for raw in websocket.iter_text():
                        msg   = json.loads(raw)
                        event = msg.get("event")

                        if event == "media":
                            twilio_pkt_count += 1
                            try:
                                mulaw  = base64.b64decode(msg["media"]["payload"])
                                pcm8k  = audioop.ulaw2lin(mulaw, 2)
                                pcm16k, upsample_state = audioop.ratecv(
                                    pcm8k, 2, 1, 8000, 16000, upsample_state)
                                pcm16k = audioop.mul(pcm16k, 2, 1.5)
                                pcm_buf.extend(pcm16k)
                                packets += 1
                            except Exception as e:
                                log.error(f"[T->EL] Audio conversion error: {e}")
                                continue

                            if packets >= BUFFER_PACKETS:
                                try:
                                    await el_ws.send(json.dumps({
                                        "user_audio_chunk": base64.b64encode(bytes(pcm_buf)).decode()
                                    }))
                                    el_send_count += 1
                                    if el_send_count % 50 == 0:
                                        log.info(f"[T->EL] sent {el_send_count} chunks ({twilio_pkt_count} pkts)")
                                except ConnectionClosedOK:
                                    break
                                except ConnectionClosed as e:
                                    log.warning(f"[T->EL] EL connection closed: {e}")
                                    break
                                except Exception as e:
                                    log.error(f"[T->EL] Send error: {type(e).__name__}: {e}")
                                    traceback.print_exc()
                                    break
                                pcm_buf.clear()
                                packets = 0

                        elif event == "stop":
                            if pcm_buf and packets:
                                try:
                                    await el_ws.send(json.dumps({
                                        "user_audio_chunk": base64.b64encode(bytes(pcm_buf)).decode()
                                    }))
                                    el_send_count += 1
                                except Exception:
                                    pass
                            log.info(f"[T->EL] Stop — Twilio={twilio_pkt_count} EL_sent={el_send_count}")
                            break

                except Exception as e:
                    log.error(f"[T->EL] Loop error: {type(e).__name__}: {e}")
                    traceback.print_exc()
                finally:
                    log.info(f"[T->EL] Exiting — Twilio={twilio_pkt_count} EL_sent={el_send_count}")
                    try:
                        await el_ws.close()
                    except Exception:
                        pass

            async def elevenlabs_to_twilio():
                nonlocal el_audio_count, goodbye_detected
                downsample_state     = None
                goodbye_audio_chunks = 0

                try:
                    async for raw in el_ws:
                        try:
                            msg = json.loads(raw) if isinstance(raw, (str, bytes)) else {}
                        except Exception:
                            continue

                        t = msg.get("type", "")

                        if t == "audio":
                            el_audio_count += 1
                            if not stream_sid:
                                log.warning(f"[EL->T] Audio #{el_audio_count} — stream_sid empty! Dropping.")
                                continue
                            audio_b64 = (
                                msg.get("audio_event", {}).get("audio_base_64")
                                or msg.get("audio", {}).get("chunk", "")
                            )
                            if not audio_b64:
                                continue
                            try:
                                raw_audio = base64.b64decode(audio_b64)
                                if output_fmt == "ulaw_8000":
                                    mulaw = raw_audio
                                elif output_fmt == "pcm_8000":
                                    mulaw = audioop.lin2ulaw(raw_audio, 2)
                                else:  # pcm_16000 default
                                    if len(raw_audio) % 2 != 0:
                                        raw_audio = raw_audio[:-1]
                                    pcm8k, downsample_state = audioop.ratecv(
                                        raw_audio, 2, 1, 16000, 8000, downsample_state)
                                    mulaw = audioop.lin2ulaw(pcm8k, 2)
                                await websocket.send_json({
                                    "event":     "media",
                                    "streamSid": stream_sid,
                                    "media":     {"payload": base64.b64encode(mulaw).decode()},
                                })
                                if el_audio_count % 20 == 0:
                                    log.info(f"[EL->T] Forwarded {el_audio_count} audio chunks")

                                if goodbye_detected:
                                    goodbye_audio_chunks += 1
                                    if goodbye_audio_chunks >= 6:
                                        log.info("[EL->T] Goodbye audio delivered — hanging up call")
                                        asyncio.ensure_future(_hangup_twilio_call(call_sid))
                                        break

                            except Exception as e:
                                log.error(f"[EL->T] Audio error: {type(e).__name__}: {e}")

                        elif t == "interruption":
                            if stream_sid:
                                try:
                                    await websocket.send_json({"event": "clear", "streamSid": stream_sid})
                                except Exception:
                                    pass
                            log.info("[EL] Interruption (barge-in)")

                        elif t == "ping":
                            pe    = msg.get("ping_event", {})
                            delay = pe.get("ping_ms") or 0
                            if isinstance(delay, (int, float)) and delay > 0:
                                await asyncio.sleep(delay / 1000)
                            try:
                                await el_ws.send(json.dumps({"type": "pong", "event_id": pe.get("event_id")}))
                            except Exception:
                                pass

                        elif t == "agent_response":
                            text = msg.get("agent_response_event", {}).get("agent_response", "")
                            if text:
                                log.info(f"[EL] MAYA said: {text!r}")
                                transcript.append({"role": "agent", "text": text})
                                if not goodbye_detected and _is_goodbye(text, preferred_language):
                                    goodbye_detected     = True
                                    goodbye_audio_chunks = 0
                                    log.info("[EL] Goodbye phrase detected — will hang up after audio")

                        elif t == "user_transcript":
                            text = msg.get("user_transcription_event", {}).get("user_transcript", "")
                            if text:
                                log.info(f"[EL] CUSTOMER said: {text!r}")
                                transcript.append({"role": "customer", "text": text})

                        elif t == "conversation_initiation_metadata":
                            pass

                        else:
                            log.debug(f"[EL] msg type={t!r}: {str(msg)[:120]}")

                except Exception as e:
                    log.error(f"[EL->T] Loop error: {type(e).__name__}: {e}")
                    traceback.print_exc()
                finally:
                    log.info(f"[EL->T] Exiting — EL_audio_received={el_audio_count}")

            await asyncio.gather(
                twilio_to_elevenlabs(),
                elevenlabs_to_twilio(),
                return_exceptions=True,
            )
            log.info(
                f"[WS] Relay complete — Twilio={twilio_pkt_count} "
                f"EL_sent={el_send_count} EL_audio={el_audio_count} "
                f"transcript_turns={len(transcript)}"
            )

    except Exception as e:
        log.error(f"[WS] ElevenLabs connection error: {type(e).__name__}: {e}")
        traceback.print_exc()
    finally:
        # ── Save call log ─────────────────────────────────────────────────────
        duration_s   = int(time.time() - call_start)
        mins, secs   = divmod(duration_s, 60)
        duration_str = f"{mins}:{secs:02d}"

        try:
            from data.sample_leads import add_call_log, add_call_to_lead
            log_entry = {
                "call_id":    call_sid,
                "lead_id":    lead_id,
                "recipient":  customer_name,
                "lead_name":  customer_name,
                "phone":      customer_phone,
                "duration":   duration_str,
                "status":     "Completed",
                "outcome":    "Maya AI call completed",
                "date":       datetime.now().isoformat(),
                "timestamp":  datetime.now().isoformat(),
                "escalated":  False,
                "transcript": transcript,
                # recording_sid and ai_analysis filled in by _post_call_analysis
            }
            add_call_log(log_entry)
            if lead_id != "unknown":
                add_call_to_lead(lead_id, {
                    "call_id":   call_sid,
                    "timestamp": datetime.now().isoformat(),
                    "duration":  duration_str,
                    "status":    "Completed",
                    "outcome":   "Maya AI call completed",
                })
            log.info(f"[WS] Call log saved — lead={lead_id} duration={duration_str} turns={len(transcript)}")
        except Exception as e:
            log.error(f"[WS] Failed to save call log: {e}")

        # ── Fire background post-call analysis ───────────────────────────────
        if transcript or True:  # Always attempt (recording fetch doesn't need transcript)
            asyncio.ensure_future(
                _post_call_analysis(call_sid, lead_id, transcript, customer_name)
            )
            log.info(f"[WS] Post-call analysis queued for {call_sid}")

        try:
            await websocket.close()
        except Exception:
            pass
        log.info(f"[WS] Closed — call_sid={call_sid}")
