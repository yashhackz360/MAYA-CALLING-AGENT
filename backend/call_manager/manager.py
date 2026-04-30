"""
Call Manager — Orchestrates the lifecycle of a call session.
Manages active sessions and persists results to the lead store.
"""

import uuid
from datetime import datetime
from typing import Optional
from data.sample_leads import (
    get_lead, update_lead_status, add_call_to_lead, add_call_log
)
from agent.conversation import (
    CallSession, ConversationState,
    get_opening_message, process_customer_input
)

# ─── Active Sessions Registry ─────────────────────────────────────────────────

_active_sessions: dict[str, CallSession] = {}

# ─── Call Lifecycle ───────────────────────────────────────────────────────────

def initiate_call(lead_id: str) -> dict:
    """Create and register a new call session."""
    lead = get_lead(lead_id)
    if not lead:
        return {"error": f"Lead '{lead_id}' not found"}

    call_id = f"CALL-{str(uuid.uuid4())[:6].upper()}"
    session = CallSession(lead=lead, call_id=call_id)

    # Generate opening message
    opening = get_opening_message(lead)
    session.add_turn("agent", opening)
    session.state = ConversationState.NAME_CONFIRM

    # Register session
    _active_sessions[call_id] = session

    # Update lead status
    update_lead_status(lead_id, "Contacted")

    return {
        "call_id": call_id,
        "lead_id": lead_id,
        "lead_name": lead["name"],
        "lead_phone": lead["phone"],
        "opening_message": opening,
        "state": session.state,
        "status": "initiated"
    }


async def process_turn(call_id: str, user_input: str) -> dict:
    """Process one turn of conversation."""
    session = _active_sessions.get(call_id)
    if not session:
        return {"error": f"No active session for call '{call_id}'"}

    # NOTE: Do NOT call session.add_turn("customer", ...) here.
    # process_customer_input() already adds the customer turn FIRST
    # (before calling the LLM) so conversation history is coherent.
    # Adding it here would duplicate every customer message in the transcript.

    # Get agent response (also records both customer + agent turns internally)
    result = await process_customer_input(session, user_input)

    # Handle call end
    if result.get("call_ended"):
        _finalize_call(call_id, session)

    result["call_id"] = call_id
    result["transcript"] = session.transcript
    return result


def _finalize_call(call_id: str, session: CallSession) -> None:
    """Persist call results and clean up session."""
    lead_id = session.lead["lead_id"]
    outcome = session.outcome or "Completed"

    # Determine lead tag based on outcome
    # session.escalated is the only reliable outcome flag on CallSession.
    # (selected_option was removed — the LLM flow is natural language, no DTMF menus)
    if session.escalated:
        tag = "Hot"
        status = "Contacted"
    elif outcome == "Completed – Natural Conversation":
        tag = "Warm"
        status = "Contacted"
    else:
        tag = "Warm"
        status = "Contacted"

    update_lead_status(lead_id, status, tag)

    # Build call record
    call_record = {
        "call_id": call_id,
        "timestamp": session.started_at,
        "ended_at": session.ended_at or datetime.now().isoformat(),
        "duration": _calc_duration(session.started_at),
        "status": "Completed",
        "outcome": outcome,
        "transcript_length": len(session.transcript),
        "escalated": session.escalated
    }

    add_call_to_lead(lead_id, call_record)
    add_call_log({
        "call_id": call_id,
        "lead_id": lead_id,
        "caller": "Škoda Customer Care AI (Maya)",
        "recipient": session.lead["name"],
        "phone": session.lead["phone"],
        "duration": _calc_duration(session.started_at),
        "status": "Completed",
        "outcome": outcome,
        "date": session.started_at,
        "transcript": session.transcript,
        "escalated": session.escalated
    })

    # Remove from active sessions
    _active_sessions.pop(call_id, None)


def get_session(call_id: str) -> Optional[CallSession]:
    return _active_sessions.get(call_id)


def get_active_sessions() -> list:
    return [s.to_dict() for s in _active_sessions.values()]


def _calc_duration(started_at: str) -> str:
    """Calculate call duration as mm:ss string."""
    try:
        start = datetime.fromisoformat(started_at)
        delta = datetime.now() - start
        minutes = int(delta.total_seconds() // 60)
        seconds = int(delta.total_seconds() % 60)
        return f"{minutes}:{seconds:02d}"
    except Exception:
        return "0:00"


def end_call(call_id: str) -> dict:
    """Force-end a call."""
    session = _active_sessions.get(call_id)
    if not session:
        return {"error": "Session not found"}
    session.outcome = "Agent Ended"
    session.ended_at = datetime.now().isoformat()
    _finalize_call(call_id, session)
    return {"call_id": call_id, "status": "ended"}
