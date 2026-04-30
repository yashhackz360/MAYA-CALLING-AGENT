"""
MantaRay AI — Škoda Customer Care Agent — FastAPI Backend
Provides REST + WebSocket endpoints for the React frontend.
Includes CRM WebSocket broadcast for real-time lead notifications.
"""

import sys
import io
# Force UTF-8 stdout/stderr so Unicode print() never crashes on Windows cp1252
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import json
import os
import asyncio
import base64
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from twilio_handler import router as twilio_router, register_call

from data.sample_leads import (
    get_all_leads, get_lead, create_lead,
    get_call_logs, get_analytics, get_campaigns
)
from call_manager.manager import (
    initiate_call, process_turn, end_call,
    get_active_sessions, get_session
)
from agent.llm_client import (
    init_llm_backend, get_deepgram_api_key, get_xai_api_key, get_active_backend,
    build_xai_session_config, tts, humanize_for_speech, deepgram_transcribe,
    XAI_REALTIME_URL, XAI_SAMPLE_RATE, XAI_VOICE, XAI_MODEL,
    DEEPGRAM_MODEL, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL,
)

TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN",  "")
TWILIO_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
PUBLIC_URL    = os.getenv("PUBLIC_BASE_URL",    "")

# Initialise LLM backend at startup (xAI → fallback)
init_llm_backend()

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="MantaRay AI — Škoda Customer Care Agent API",
    version="2.0.0",
    description="Škoda Auto India customer care AI calling agent"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:80", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twilio_router)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    name: str
    phone: str
    email: str
    company_name: str = ""
    source: str = "Website"
    preferred_language: str = ""
    contact_consent: bool = True
    communication_consent: bool = False
    preferences: dict = {}

class CallInitiate(BaseModel):
    lead_id: str

class TurnInput(BaseModel):
    call_id: str
    user_input: str

# ─── CRM WebSocket — Real-time Lead Notifications ────────────────────────────

_crm_clients: set[WebSocket] = set()

@app.websocket("/ws/crm")
async def crm_websocket(websocket: WebSocket):
    """WebSocket for CRM dashboard — receives real-time lead notifications."""
    await websocket.accept()
    _crm_clients.add(websocket)
    try:
        while True:
            # Keep alive — listen for pings
            raw = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        _crm_clients.discard(websocket)
    except Exception:
        _crm_clients.discard(websocket)

async def broadcast_new_lead(lead: dict):
    """Broadcast new lead notification to all connected CRM clients."""
    message = {
        "type": "new_lead",
        "lead": lead,
        "message": f"New enquiry from {lead.get('name', 'Unknown')}!",
        "timestamp": datetime.now().isoformat()
    }
    dead_clients = set()
    for ws in _crm_clients.copy():
        try:
            await ws.send_json(message)
        except Exception:
            dead_clients.add(ws)
    _crm_clients.difference_update(dead_clients)

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "MantaRay AI — Škoda Customer Care Agent", "version": "2.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# ─── Leads API ────────────────────────────────────────────────────────────────

@app.get("/api/leads")
def list_leads():
    return {"leads": get_all_leads(), "total": len(get_all_leads())}

@app.get("/api/leads/{lead_id}")
def get_lead_detail(lead_id: str):
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@app.post("/api/leads")
async def add_lead(payload: LeadCreate):
    """Create a new lead and, if Twilio is configured, auto-dial the customer."""
    try:
        lead_data = payload.model_dump()
        lead = create_lead(lead_data)
        await broadcast_new_lead(lead)

        if TWILIO_SID and lead.get("contact_consent") and lead.get("phone"):
            try:
                from twilio.rest import Client as TwilioClient
                client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
                call = client.calls.create(
                    to=lead["phone"],
                    from_=TWILIO_NUMBER,
                    url=f"{PUBLIC_URL}/twilio/voice",
                )
                register_call(call.sid, lead["lead_id"])
                print(f"[Twilio] Outbound call initiated — SID={call.sid} to={lead['phone']}")
            except Exception as e:
                print(f"[Twilio] Call initiation failed (non-fatal): {e}")

        return {"success": True, "lead_id": lead["lead_id"], "lead": lead}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ─── Calls API ────────────────────────────────────────────────────────────────

@app.post("/api/calls/initiate")
def start_call(payload: CallInitiate):
    result = initiate_call(payload.lead_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/api/calls/turn")
async def call_turn(payload: TurnInput):
    result = await process_turn(payload.call_id, payload.user_input)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/api/calls/{call_id}/end")
def stop_call(call_id: str):
    return end_call(call_id)

@app.get("/api/calls/active")
def active_calls():
    return {"active_calls": get_active_sessions()}

@app.get("/api/calls/logs")
def call_logs():
    return {"logs": get_call_logs()}

# ─── Analytics API ────────────────────────────────────────────────────────────

@app.get("/api/analytics")
def analytics():
    return get_analytics()

# ─── Campaigns API ────────────────────────────────────────────────────────────

@app.get("/api/campaigns")
def campaigns():
    return {"campaigns": get_campaigns()}

# ─── WebSocket — Real-time Call Conversation ──────────────────────────────────

@app.websocket("/ws/call/{call_id}")
async def call_websocket(websocket: WebSocket, call_id: str):
    """
    WebSocket endpoint for real-time call simulation.
    Messages are JSON: { "type": "input", "text": "...", "call_id": "..." }
    Responses are JSON: { "type": "agent_turn", "text": "...", "state": "...", ... }
    """
    await websocket.accept()

    try:
        # Send a "connected" message
        await websocket.send_json({
            "type": "connected",
            "call_id": call_id,
            "message": "WebSocket connected. Ready for conversation."
        })

        while True:
            # Wait for customer input
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if data.get("type") == "end_call":
                result = end_call(call_id)
                await websocket.send_json({"type": "call_ended", **result})
                break

            user_input = data.get("text", "")
            if not user_input:
                continue

            # Process the turn
            result = await process_turn(call_id, user_input)

            # Send back agent response
            await websocket.send_json({
                "type": "agent_turn",
                "agent_text": result.get("agent_text", ""),
                "state": result.get("state", ""),
                "options": result.get("options"),
                "escalated": result.get("escalated", False),
                "call_ended": result.get("call_ended", False),
                "transcript": result.get("transcript", []),
                "call_id": call_id
            })

            if result.get("call_ended"):
                await websocket.send_json({"type": "call_ended", "call_id": call_id})
                break

    except WebSocketDisconnect:
        print(f"[WS] Client disconnected from call {call_id}")
        # Finalize call if still active
        session = get_session(call_id)
        if session:
            end_call(call_id)
    except Exception as e:
        print(f"[WS Error] {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@app.websocket("/ws/call-stream/{call_id}")
async def call_stream_websocket(websocket: WebSocket, call_id: str):
    """
    Streaming WebSocket — sends agent audio sentence-by-sentence.
    Each sentence's TTS is sent as soon as LLM generates it.
    Reduces time-to-first-audio from ~4s to ~800ms.

    Messages from browser: { "type": "input", "text": "..." }
    Messages to browser:
      { "type": "agent_audio_chunk", "text": "...", "audio": "base64...", "chunk_index": 0, "is_last": false }
      { "type": "agent_turn_complete", "full_text": "...", "state": "...", "call_ended": false }
    """
    await websocket.accept()
    print(f"[WS-Stream] Client connected for call {call_id}")

    try:
        await websocket.send_json({
            "type": "connected",
            "call_id": call_id,
            "message": "Streaming WebSocket connected.",
            "streaming": True,
        })

        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if data.get("type") == "end_call":
                result = end_call(call_id)
                await websocket.send_json({"type": "call_ended", **result})
                break

            user_input = data.get("text", "")
            if not user_input:
                continue

            # Process the turn AND stream audio chunks back
            session = get_session(call_id)
            if not session:
                await websocket.send_json({"type": "error", "message": "No active session"})
                continue

            # Record customer turn
            from agent.conversation import process_customer_input
            result = await process_customer_input(session, user_input)
            agent_text = result.get("agent_text", "")

            if not agent_text:
                await websocket.send_json({
                    "type": "agent_turn_complete",
                    "full_text": "",
                    "state": result.get("state", ""),
                    "call_ended": result.get("call_ended", False),
                    "call_id": call_id,
                })
                continue

            # Split into sentences for streaming TTS
            import re
            sentences = re.split(r'(?<=[.!?,])\s+', agent_text.strip())
            sentences = [s.strip() for s in sentences if s.strip()]
            cleaned_sentences = [humanize_for_speech(s) for s in sentences]
            cleaned_sentences = [s for s in cleaned_sentences if s]

            if not cleaned_sentences:
                cleaned_sentences = [agent_text]

            # OPTIMIZATION: Generate TTS for ALL sentences concurrently
            # This cuts multi-sentence TTS from N*800ms to ~800ms total
            async def _generate_tts(text):
                try:
                    return await tts(text)
                except Exception as e:
                    print(f"[WS-Stream] TTS error: {e}")
                    return None

            tts_tasks = [_generate_tts(s) for s in cleaned_sentences]
            audio_results = await asyncio.gather(*tts_tasks)

            # Stream audio chunks to frontend as fast as possible
            for i, (cleaned, audio) in enumerate(zip(cleaned_sentences, audio_results)):
                audio_b64 = base64.b64encode(audio).decode("utf-8") if audio else None
                is_last = (i == len(cleaned_sentences) - 1)
                await websocket.send_json({
                    "type": "agent_audio_chunk",
                    "text": cleaned,
                    "audio": audio_b64,
                    "chunk_index": i,
                    "is_last": is_last,
                })

            # Send turn-complete signal
            await websocket.send_json({
                "type": "agent_turn_complete",
                "full_text": agent_text,
                "state": result.get("state", ""),
                "escalated": result.get("escalated", False),
                "call_ended": result.get("call_ended", False),
                "transcript": session.transcript if session else [],
                "call_id": call_id,
            })

            if result.get("call_ended"):
                break

    except WebSocketDisconnect:
        print(f"[WS-Stream] Client disconnected from call {call_id}")
        session = get_session(call_id)
        if session:
            end_call(call_id)
    except Exception as e:
        print(f"[WS-Stream Error] {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ─── xAI Voice API Endpoints ──────────────────────────────────────────────────

@app.get("/api/voice/config")
def voice_config():
    """Return voice pipeline configuration for the frontend."""
    return {
        "available": get_xai_api_key() is not None,
        "backend":   get_active_backend(),
        "pipeline": {
            "stt":   {"provider": "deepgram", "model": DEEPGRAM_MODEL,       "available": get_deepgram_api_key() is not None},
            "brain": {"provider": "xai",      "model": XAI_MODEL,            "available": get_xai_api_key()      is not None},
            "tts":   {"provider": "elevenlabs","voice_id": ELEVENLABS_VOICE_ID, "model": ELEVENLABS_MODEL},
        },
        "realtime_url": XAI_REALTIME_URL,
        "sample_rate":  XAI_SAMPLE_RATE,
        "voice":        XAI_VOICE,
    }


@app.post("/api/voice/session-config/{lead_id}")
def voice_session_config(lead_id: str):
    """Return xAI session.update payload pre-configured for a specific lead."""
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    config = build_xai_session_config(lead)
    return {"session_config": config}


class TTSRequest(BaseModel):
    text: str
    voice: str = "ara"


@app.post("/api/voice/tts")
async def text_to_speech(payload: TTSRequest):
    """Generate speech audio — ElevenLabs Tara first, xAI fallback."""
    audio_bytes = await tts(payload.text)
    if audio_bytes is None:
        raise HTTPException(status_code=503, detail="TTS not available — set ELEVENLABS_API_KEY or XAI_API_KEY")
    return JSONResponse(
        content={"audio": base64.b64encode(audio_bytes).decode("utf-8"), "format": "mp3"},
        media_type="application/json"
    )


@app.post("/api/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Transcribe audio via Deepgram Nova-2 (Indian English + Hindi/Hinglish detection).
    Falls back to xAI grok-stt if Deepgram key is not set."""
    audio_bytes = await audio.read()
    content_type = audio.content_type or "audio/webm"

    # Primary: Deepgram Nova-2
    if get_deepgram_api_key():
        text = await deepgram_transcribe(audio_bytes, content_type)
        if text is not None:
            return {"text": text, "provider": "deepgram"}

    # Fallback: xAI grok-stt
    xai_key = get_xai_api_key()
    if xai_key:
        import httpx as _httpx
        filename = audio.filename or "audio.webm"
        async with _httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                "https://api.x.ai/v1/stt",
                headers={"Authorization": f"Bearer {xai_key}"},
                files={"file": (filename, audio_bytes, content_type)},
                data={"model": "grok-stt"},
            )
        if response.status_code == 200:
            return {"text": response.json().get("text", ""), "provider": "xai"}

    raise HTTPException(
        status_code=503,
        detail="No STT provider configured. Add DEEPGRAM_API_KEY (primary) or XAI_API_KEY (fallback) to backend/.env"
    )


@app.websocket("/ws/voice/{call_id}")
async def voice_realtime_proxy(websocket: WebSocket, call_id: str):
    """
    WebSocket proxy between the browser and xAI Realtime Voice Agent.
    This runs on the server so the API key never reaches the client.

    Browser ↔ FastAPI ↔ xAI wss://api.x.ai/v1/realtime

    Messages flow:
      Browser → (PCM audio chunks / text) → FastAPI → xAI
      xAI → (PCM audio response / transcripts) → FastAPI → Browser
    """
    import websockets as ws_lib

    xai_key = get_xai_api_key()
    if not xai_key:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "XAI_API_KEY not configured"})
        await websocket.close()
        return

    await websocket.accept()
    print(f"[Voice WS] Client connected for call {call_id}")

    xai_ws = None
    try:
        # Connect to xAI Realtime
        xai_ws = await ws_lib.connect(
            XAI_REALTIME_URL,
            additional_headers={"Authorization": f"Bearer {xai_key}"},
            max_size=10 * 1024 * 1024,  # 10MB
        )
        print(f"[Voice WS] Connected to xAI Realtime for call {call_id}")

        # Notify browser
        await websocket.send_json({
            "type": "voice_connected",
            "call_id": call_id,
            "message": "Connected to xAI Voice Agent"
        })

        # ── Forward messages in both directions concurrently ──────────────

        async def browser_to_xai():
            """Forward browser messages to xAI."""
            try:
                while True:
                    raw = await websocket.receive_text()
                    data = json.loads(raw)

                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                        continue

                    if data.get("type") == "end_call":
                        # Close xAI session gracefully
                        break

                    # Forward to xAI as-is (session.update, input_audio_buffer.append, etc.)
                    await xai_ws.send(json.dumps(data))
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"[Voice WS] browser->xAI error: {e}")

        async def xai_to_browser():
            """Forward xAI responses to browser."""
            try:
                async for message in xai_ws:
                    event = json.loads(message)
                    # Forward all xAI events to the browser
                    await websocket.send_json(event)
            except Exception as e:
                print(f"[Voice WS] xAI->browser error: {e}")

        # Run both directions concurrently
        await asyncio.gather(
            browser_to_xai(),
            xai_to_browser(),
            return_exceptions=True
        )

    except Exception as e:
        print(f"[Voice WS] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if xai_ws:
            await xai_ws.close()
        print(f"[Voice WS] Session ended for call {call_id}")


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
