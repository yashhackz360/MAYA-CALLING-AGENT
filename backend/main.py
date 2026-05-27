"""
MantaRay AI — Škoda Customer Care Agent — FastAPI Backend (v3)
Path A only: Twilio outbound calling + ElevenLabs Conversational Agent.
All browser-simulation (Path B) endpoints have been removed.
"""

import sys
import io
# Force UTF-8 stdout/stderr so Unicode print() never crashes on Windows cp1252
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import json
import os
import hmac
import hashlib
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from twilio_handler import router as twilio_router, register_call

from data.sample_leads import (
    get_all_leads, get_lead, create_lead,
    get_call_logs, get_analytics, get_campaigns,
    update_lead, delete_lead,
    find_duplicate_lead, merge_lead,
)

from data.dealerships import (
    get_dealers_for_city, get_dealer_for_city,
    get_inventory_for_model, get_variant_availability,
    build_dealer_intelligence, list_all_cities, list_all_models,
    get_full_dealer_list, INVENTORY,
)

TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN",  "")
TWILIO_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

RAZORPAY_KEY_ID     = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

try:
    import razorpay as _razorpay_lib
    _HAS_RAZORPAY = True
except ImportError:
    _HAS_RAZORPAY = False

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="MantaRay AI — Škoda Customer Care Agent API",
    version="3.0.0",
    description="Škoda Auto India AI calling agent — Twilio + ElevenLabs"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "*"],
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

class LeadUpdate(BaseModel):
    tag:            Optional[str] = None
    status:         Optional[str] = None
    engagement:     Optional[str] = None
    engagability:   Optional[str] = None
    notes:          Optional[str] = None
    address:        Optional[str] = None
    next_action:    Optional[str] = None
    follow_up_date: Optional[str] = None
    preferences:    Optional[dict] = None

class BillingOrderRequest(BaseModel):
    amount: int
    currency: str = "INR"
    invoice_id: str

class BillingVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    invoice_id: str

# ─── CRM WebSocket — Real-time Lead Notifications ────────────────────────────

_crm_clients: set[WebSocket] = set()

@app.websocket("/ws/crm")
async def crm_websocket(websocket: WebSocket):
    """WebSocket for CRM dashboard — receives real-time lead notifications."""
    await websocket.accept()
    _crm_clients.add(websocket)
    try:
        while True:
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
    dead = set()
    for ws in _crm_clients.copy():
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    _crm_clients.difference_update(dead)

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "MantaRay AI — Škoda Customer Care Agent",
        "version": "3.0.0",
        "mode": "Twilio + ElevenLabs"
    }

@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# ─── Leads API ────────────────────────────────────────────────────────────────

@app.get("/api/leads")
def list_leads():
    leads = get_all_leads()
    return {"leads": leads, "total": len(leads)}

@app.get("/api/leads/{lead_id}")
def get_lead_detail(lead_id: str):
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@app.patch("/api/leads/{lead_id}")
def patch_lead(lead_id: str, payload: LeadUpdate):
    if not get_lead(lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    update_lead(lead_id, payload.model_dump(exclude_none=True))
    return {"success": True, "lead": get_lead(lead_id)}

@app.delete("/api/leads/{lead_id}")
def remove_lead(lead_id: str):
    if not delete_lead(lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True}

@app.post("/api/leads/{lead_id}/call")
async def call_lead(lead_id: str):
    """Initiate a Twilio outbound call to a specific lead."""
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_NUMBER:
        raise HTTPException(status_code=503, detail="Twilio credentials not configured")
    phone = lead.get("phone", "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Lead has no phone number")
    try:
        from twilio.rest import Client as TwilioClient
        from twilio_handler import _public_url
        client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        call   = client.calls.create(
            to=phone,
            from_=TWILIO_NUMBER,
            url=f"{_public_url()}/twilio/voice",
            record=True,
        )
        register_call(call.sid, lead_id)
        print(f"[Twilio] Outbound call — SID={call.sid} to={phone} lead={lead_id}")
        return {"success": True, "call_sid": call.sid, "status": call.status, "to": phone}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/leads")
async def add_lead(payload: LeadCreate):
    """Create a new lead, or merge into existing if phone/email already exists."""
    try:
        data = payload.model_dump()

        # ── Duplicate check ───────────────────────────────────────────────────
        existing = find_duplicate_lead(data.get("phone", ""), data.get("email", ""))
        if existing:
            lead      = merge_lead(existing["lead_id"], data)
            is_repeat = True
            print(f"[Leads] Returning lead detected — merged into {lead['lead_id']}")
        else:
            lead      = create_lead(data)
            is_repeat = False
            await broadcast_new_lead(lead)

        # ── Auto-dial ─────────────────────────────────────────────────────────
        if TWILIO_SID and lead.get("contact_consent", True) and lead.get("phone"):
            try:
                from twilio.rest import Client as TwilioClient
                from twilio_handler import _public_url
                client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
                call = client.calls.create(
                    to=lead["phone"],
                    from_=TWILIO_NUMBER,
                    url=f"{_public_url()}/twilio/voice",
                    record=True,
                )
                register_call(call.sid, lead["lead_id"])
                print(f"[Twilio] Auto-dial — SID={call.sid} to={lead['phone']} repeat={is_repeat}")
            except Exception as e:
                print(f"[Twilio] Auto-dial failed (non-fatal): {e}")

        return {
            "success":   True,
            "lead_id":   lead["lead_id"],
            "lead":      lead,
            "returning": is_repeat,
            "message":   "Welcome back! We have your details on file." if is_repeat else "Enquiry received!",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ─── Call Logs API ────────────────────────────────────────────────────────────

@app.get("/api/calls/logs")
def call_logs():
    return {"logs": get_call_logs()}


@app.get("/api/recordings/{recording_sid}")
async def proxy_recording(recording_sid: str):
    """Proxy a Twilio call recording through the backend (handles Basic Auth)."""
    if not TWILIO_SID or not TWILIO_TOKEN:
        raise HTTPException(status_code=503, detail="Twilio not configured")
    import httpx
    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{TWILIO_SID}/Recordings/{recording_sid}.mp3"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, auth=(TWILIO_SID, TWILIO_TOKEN))
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Recording not found")
            r.raise_for_status()
            from fastapi.responses import Response as _Resp
            return _Resp(
                content=r.content,
                media_type="audio/mpeg",
                headers={"Content-Disposition": f"inline; filename={recording_sid}.mp3"},
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Analytics API ────────────────────────────────────────────────────────────

@app.get("/api/analytics")
def analytics():
    return get_analytics()

# ─── Campaigns API ────────────────────────────────────────────────────────────

@app.get("/api/campaigns")
def campaigns():
    return {"campaigns": get_campaigns()}

# ─── Dealership Intelligence API ──────────────────────────────────────────────────

@app.get("/api/dealerships")
def list_dealerships(city: Optional[str] = None):
    """Return all dealerships, optionally filtered by city."""
    if city:
        dealers = get_dealers_for_city(city)
        if not dealers:
            raise HTTPException(status_code=404, detail=f"No dealerships found for city: {city}")
        return {"city": city, "dealerships": dealers, "count": len(dealers)}
    return {"dealerships": get_full_dealer_list(), "cities": list_all_cities()}


@app.get("/api/dealerships/cities")
def supported_cities():
    """Return all cities that have Skňoda dealerships."""
    return {"cities": list_all_cities()}


@app.get("/api/inventory")
def list_inventory(model: Optional[str] = None, variant: Optional[str] = None):
    """Return inventory for all models or a specific model + optional variant filter."""
    if model:
        data = get_inventory_for_model(model)
        if not data:
            raise HTTPException(status_code=404, detail=f"Model not found: {model}")
        variants = get_variant_availability(model, variant or "")
        return {"model": model, "details": data, "variants": variants}
    # Return summary for all models
    summary = []
    for name, data in INVENTORY.items():
        summary.append({
            "model":       name,
            "category":    data["category"],
            "price_range": data["price_range"],
            "tagline":     data["tagline"],
            "models":      list_all_models(),
        })
    return {"inventory": summary}


@app.get("/api/dealer-intelligence")
def dealer_intelligence(
    city: str,
    model: Optional[str] = None,
    variant: Optional[str] = None,
    transmission: Optional[str] = None,
):
    """
    Returns AI-ready context strings for a city + model combination.
    These are the exact strings injected into the ElevenLabs voice agent.
    """
    intel = build_dealer_intelligence(
        city=city,
        model=model or "",
        variant=variant or "",
        transmission=transmission or "",
    )
    return {
        "city":  city,
        "model": model,
        "intelligence": intel,
    }


# ─── Billing / Razorpay ───────────────────────────────────────────────────────

@app.post("/api/billing/create-order")
async def create_billing_order(req: BillingOrderRequest):
    if not _HAS_RAZORPAY:
        raise HTTPException(status_code=503, detail="razorpay package not installed — run: pip install razorpay")
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set in .env")
    try:
        client = _razorpay_lib.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        order = client.order.create({
            "amount":   req.amount * 100,
            "currency": req.currency,
            "receipt":  req.invoice_id,
            "notes":    {"invoice_id": req.invoice_id},
        })
        return order
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/billing/verify")
async def verify_billing_payment(req: BillingVerifyRequest):
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="RAZORPAY_KEY_SECRET not set in .env")
    body = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    return {"success": True, "payment_id": req.razorpay_payment_id, "invoice_id": req.invoice_id}

# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
