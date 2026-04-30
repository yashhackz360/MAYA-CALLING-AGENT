"""
AI Conversation Engine — state machine for call flow + LLM for ALL dialogue.

The state machine handles ROUTING (what phase, what just happened).
The LLM handles all DIALOGUE — zero hardcoded agent lines in the main flow.

Phases:
  NAME_CONFIRM     → customer answers; Maya greets + asks language
  LANGUAGE_SELECT  → customer picks English / Hindi → language LOCKED → straight to DISCOVERY
  DISCOVERY        → main LLM conversation; language mimicked every turn
  ESCALATION       → transfer to human (popup shown, call stays open)
  ENDED            → call complete
"""

import re
import uuid
from datetime import datetime
from typing import Optional
from agent.llm_client import get_ai_response, humanize_for_speech, detect_gender, _detect_language


# ─── Conversation States ──────────────────────────────────────────────────────

class ConversationState:
    NAME_CONFIRM    = "name_confirm"
    LANGUAGE_SELECT = "language_select"
    DISCOVERY       = "discovery"
    ESCALATION      = "escalation"
    ENDED           = "ended"


# ─── Keyword Sets ─────────────────────────────────────────────────────────────

BUSY_KEYWORDS = [
    # English
    "busy", "not now", "bad time", "wrong time", "bad timing",
    "in a meeting", "call me later", "call back later",
    "can't talk", "cannot talk", "don't have time", "no time",
    "will call you", "i'll call", "call you back",
    "cut the call", "hang up", "end the call", "disconnect",
    "gotta go", "got to go", "have to go", "running late",
    "in traffic", "driving", "on another call", "not interested right now",
    # Hindi / Hinglish
    "biji", "vyast", "busy hoon", "abhi busy", "baad mein call",
    "baad mein baat", "baad mein karo", "thoda busy", "time nahi",
    "abhi nahi", "abhi mat", "baad mein milte", "call karo baad mein",
]

ESCALATION_KEYWORDS = [
    # English
    "speak to a human", "talk to a human", "connect me to a human",
    "real person", "connect me to a person", "human consultant",
    "human agent", "senior executive", "connect me to support",
    "transfer me", "escalate", "talk to someone",
    "speak to manager", "talk to manager", "speak to an agent",
    # Hindi / Hinglish
    "insaan se baat", "asal insaan", "senior se baat", "manager se baat",
    "human chahiye", "real insaan", "executive se milna",
]

END_KEYWORDS = [
    # English
    "bye", "goodbye", "ok bye", "okay bye", "that's all",
    "thanks bye", "thank you bye", "not interested",
    "no thank you", "no thanks", "that's enough",
    "ok thank you", "okay thank you", "ok thanks", "alright thanks",
    "end call", "call end", "end the call",
    # Hindi / Hinglish — gratitude & sign-offs
    "theek hai thanks", "theek hai thank you", "shukriya",
    "dhanyawad", "bahut shukriya", "bas yehi tha", "theek hai bas",
    "ok theek hai", "okay theek hai", "accha theek hai",
    # Hindi — explicit call-end phrases
    "call khatam", "call band", "call band karo", "call khatam karo",
    "phone rakh", "phone rakhta", "phone rakhti", "rakhta hoon",
    "rakhti hoon", "rakh deta", "rakh deti", "phone rakh deta",
    "alvida", "alvida ji", "phir milenge", "phir baat karte",
    "bas karo", "zyada kuch nahi", "itna hi tha", "bas itna hi",
]

NOT_AVAILABLE_KEYWORDS = [
    "no", "nope", "not really", "don't have", "no time", "busy",
    "not a good time", "can't right now", "not right now",
    "not available", "not here", "not at home", "not interested",
    "don't call", "stop calling", "remove my number"
]

# Fixed ending — clean, professional, no name
CALL_ENDING_MESSAGE = "Thank you for contacting Škoda. Have a good day."
CALL_ENDING_HINDI   = "Aapka bahut bahut shukriya. Shubh din ho."


# ─── In-Memory Customer Profile Updater ──────────────────────────────────────

def _extract_and_update_profile(session: "CallSession", user_input: str) -> None:
    """Extract facts from customer's reply and update in-memory customer profile."""
    text = user_input.lower().strip()
    prefs = session.lead.setdefault("preferences", {})

    # ── Budget ────────────────────────────────────────────────────────────────
    budget_patterns = [
        r'(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores|cr|l)\b',
        r'(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores|cr|l|lac|lacs)\b',
        r'around\s+(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores|cr|l|lac|lacs)\b',
    ]
    for pat in budget_patterns:
        m = re.search(pat, text)
        if m:
            groups = m.groups()
            if len(groups) == 3:
                prefs['budget'] = f"Rs.{groups[0]}-{groups[1]} {groups[2].lower()}"
            else:
                prefs['budget'] = f"Rs.{groups[0]} {groups[1].lower()}"
            break

    # ── Vehicle Model ─────────────────────────────────────────────────────────
    MODELS = {
        "kushaq": "Škoda Kushaq", "slavia": "Škoda Slavia",
        "superb": "Škoda Superb", "kodiaq": "Škoda Kodiaq",
        "rapid": "Škoda Rapid",   "octavia": "Škoda Octavia",
    }
    for key, val in MODELS.items():
        if key in text:
            prefs['vehicle_model'] = val
            break

    # ── Variant ───────────────────────────────────────────────────────────────
    VARIANTS = {
        "active": "Active", "ambition": "Ambition", "style": "Style",
        "monte carlo": "Monte Carlo", "laurin": "Laurin & Klement",
        "l&k": "Laurin & Klement", "sportline": "Sportline",
    }
    for key, val in VARIANTS.items():
        if key in text:
            prefs['variant'] = val
            break

    # ── Transmission ──────────────────────────────────────────────────────────
    if any(w in text for w in ["automatic", "auto", "dsg", "at"]):
        prefs['transmission'] = "Automatic"
    elif any(w in text for w in ["manual", "mt", "stick"]):
        prefs['transmission'] = "Manual"

    # ── Enquiry Type ──────────────────────────────────────────────────────────
    if any(w in text for w in ["service", "maintenance", "repair", "workshop", "oil change"]):
        prefs['enquiry_type'] = "Service"
    elif any(w in text for w in ["new car", "purchase", "buy", "buying", "new vehicle", "book"]):
        prefs['enquiry_type'] = "New Purchase"
    elif any(w in text for w in ["test drive", "demo", "try"]):
        prefs['enquiry_type'] = "Test Drive"
    elif any(w in text for w in ["exchange", "trade", "trade in", "sell my"]):
        prefs['enquiry_type'] = "Exchange / Trade-In"

    # ── Location ─────────────────────────────────────────────────────────────
    LOCATIONS = {
        "bangalore": "Bangalore", "bengaluru": "Bangalore",
        "hyderabad": "Hyderabad", "chennai": "Chennai",
        "mumbai": "Mumbai",       "pune": "Pune",
        "delhi": "Delhi NCR",     "noida": "Delhi NCR",
        "gurgaon": "Delhi NCR",   "gurugram": "Delhi NCR",
        "kolkata": "Kolkata",     "ahmedabad": "Ahmedabad",
        "jaipur": "Jaipur",       "lucknow": "Lucknow",
        "kochi": "Kochi",         "chandigarh": "Chandigarh",
    }
    for key, val in LOCATIONS.items():
        if key in text:
            prefs['location'] = val
            break


# ─── Call Session ─────────────────────────────────────────────────────────────

class CallSession:
    def __init__(self, lead: dict, call_id: str = None):
        self.call_id        = call_id or str(uuid.uuid4())[:8]
        self.lead           = lead
        self.state          = ConversationState.NAME_CONFIRM
        self.transcript:    list[dict] = []
        self.started_at     = datetime.now().isoformat()
        self.ended_at:      Optional[str] = None
        self.outcome:       Optional[str] = None
        self.turn_count     = 0
        self.escalated      = False
        self._wrap_up_sent  = False
        self._repeat_count  = 0
        self.language       = "english"   # live-updated every DISCOVERY turn

    def add_turn(self, speaker: str, text: str):
        self.transcript.append({
            "speaker":   speaker,
            "text":      text,
            "timestamp": datetime.now().isoformat(),
            "turn":      self.turn_count,
        })
        self.turn_count += 1

    def to_dict(self) -> dict:
        return {
            "call_id":    self.call_id,
            "lead_id":    self.lead["lead_id"],
            "lead_name":  self.lead["name"],
            "state":      self.state,
            "transcript": self.transcript,
            "started_at": self.started_at,
            "ended_at":   self.ended_at,
            "outcome":    self.outcome,
            "escalated":  self.escalated,
            "turn_count": self.turn_count,
        }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _eff_lang(session: "CallSession", user_input: str) -> str:
    """
    Return the effective language for this turn.
    Session preferred_language ALWAYS wins over per-turn detection
    (prevents a short English word like 'han' from overriding chosen Hindi).
    """
    sess_lang = session.lead.get("preferred_language", "english")
    if sess_lang in ("hindi", "hinglish"):
        return sess_lang
    return _detect_language(user_input)


def _build_enquiry_detail(prefs: dict) -> str:
    parts = []
    if prefs.get("vehicle_model"): parts.append(f"the {prefs['vehicle_model']}")
    if prefs.get("enquiry_type"):  parts.append(prefs["enquiry_type"].lower())
    if prefs.get("variant"):       parts.append(f"{prefs['variant']} variant")
    return f" about {', '.join(parts)}" if parts else ""


def _build_summary(prefs: dict) -> str:
    parts = []
    if prefs.get("vehicle_model"): parts.append(prefs["vehicle_model"])
    if prefs.get("enquiry_type"):  parts.append(prefs["enquiry_type"])
    if prefs.get("location"):      parts.append(f"in {prefs['location']}")
    if prefs.get("budget"):        parts.append(f"budget {prefs['budget']}")
    return ", ".join(parts) if parts else "your requirements"


# ─── Core Conversation Handler ────────────────────────────────────────────────

async def process_customer_input(session: CallSession, user_input: str) -> dict:
    """
    Process one customer turn. Detects state transitions, then asks the LLM
    to generate ALL dialogue.

    Language mimic policy (STRICT):
      • Language is locked at LANGUAGE_SELECT and stored in session.lead["preferred_language"]
      • Every DISCOVERY turn re-validates and updates language from customer input
      • LLM always receives a CRITICAL LANGUAGE OVERRIDE instruction
      • Hardcoded responses (busy/end/escalate) are also language-aware
    """
    user_input = user_input.strip()
    user_lower = user_input.lower()

    # ── Guard: Empty input ───────────────────────────────────────────────────
    if not user_input:
        session._repeat_count += 1
        agent_text = await get_ai_response(
            session, "",
            situation="You didn't hear the customer. The line may have dropped. Ask them to repeat."
        )
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=False)

    # ── Guard: Too-short input in DISCOVERY ──────────────────────────────────
    word_count = len(user_input.split())
    if word_count < 2 and session.state == ConversationState.DISCOVERY:
        session._repeat_count += 1
        session.add_turn("customer", user_input)
        agent_text = await get_ai_response(
            session, user_input,
            situation="Customer gave a very short response. Acknowledge briefly and continue naturally."
        )
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=False)

    # Good input — reset repeat counter, record turn, update profile
    session._repeat_count = 0
    session.add_turn("customer", user_input)
    _extract_and_update_profile(session, user_input)

    # ══════════════════════════════════════════════════════════════════════════
    # STATE: NAME_CONFIRM
    # Customer answered the phone. Greet warmly, ask for language choice.
    # ══════════════════════════════════════════════════════════════════════════
    if session.state == ConversationState.NAME_CONFIRM:
        if any(kw in user_lower for kw in [
            "wrong number", "wrong person", "not me",
            "he is not", "she is not", "they are not",
            "not available", "passed away",
        ]):
            session.state   = ConversationState.ENDED
            session.outcome = "Wrong Number"
            session.ended_at = datetime.now().isoformat()
            agent_text = CALL_ENDING_MESSAGE
            session.add_turn("agent", agent_text)
            return _make_result(agent_text, session, call_ended=True)

        # If language already chosen in enquiry form, skip the language question
        pref_lang = session.lead.get("preferred_language", "")
        if pref_lang in ("hindi", "hinglish", "english"):
            session.language = pref_lang
            session.state = ConversationState.DISCOVERY
            prefs = session.lead.get("preferences", {})
            enquiry_detail = _build_enquiry_detail(prefs)
            if pref_lang == "hindi":
                agent_text = (
                    f"Shukriya call uthane ke liye. "
                    f"Main aapki enquiry{enquiry_detail.replace(' about', ' ke baare mein')} ke liye call kar rahi hoon. "
                    f"Kripya dhyan rahen, ye call record ho sakti hai."
                )
            elif pref_lang == "hinglish":
                agent_text = (
                    f"Thank you for taking the call. "
                    f"Main aapki enquiry{enquiry_detail} ke liye call kar rahi hoon. "
                    f"Please note, this call may be recorded."
                )
            else:
                agent_text = (
                    f"Thank you for taking the call. "
                    f"I am calling regarding your recent enquiry{enquiry_detail}. "
                    f"Please note, this call may be recorded for quality purposes."
                )
            session.add_turn("agent", agent_text)
            return _make_result(agent_text, session, call_ended=False)

        # No language preference — ask
        session.state = ConversationState.LANGUAGE_SELECT
        agent_text = (
            "Hello! Thank you for taking the call. "
            "To assist you better, please tell me — "
            "would you like to continue in English, or Hindi?"
        )
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=False)

    # ══════════════════════════════════════════════════════════════════════════
    # STATE: LANGUAGE_SELECT
    # Detect chosen language → lock it → jump straight to DISCOVERY.
    # Turn 3 (this response) IS the first language-correct business message.
    # ══════════════════════════════════════════════════════════════════════════
    if session.state == ConversationState.LANGUAGE_SELECT:
        lang = _detect_language(user_input)
        session.lead["preferred_language"] = lang
        session.language = lang

        # Move straight to DISCOVERY — no extra GREETING round-trip
        session.state = ConversationState.DISCOVERY

        prefs = session.lead.get("preferences", {})
        enquiry_detail = _build_enquiry_detail(prefs)

        if lang == "hindi":
            agent_text = (
                f"Bilkul. Main aapko Hindi mein madad karungi. "
                f"Main aapki recent enquiry ke baare mein call kar rahi hoon"
                f"{enquiry_detail.replace(' about', '')}. "
                f"Kripya dhyan rahen, ye call record ho sakti hai."
            )
        elif lang == "hinglish":
            agent_text = (
                f"Bilkul. I am calling regarding your enquiry{enquiry_detail}. "
                f"Please note, this call may be recorded."
            )
        else:
            agent_text = (
                f"Certainly. I am calling regarding your recent enquiry{enquiry_detail}. "
                f"Please note, this call may be recorded for training and quality purposes."
            )

        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=False)

    # ══════════════════════════════════════════════════════════════════════════
    # GLOBAL OVERRIDES — checked before LLM for every state past LANGUAGE_SELECT
    # ══════════════════════════════════════════════════════════════════════════

    # ── STRICT LANGUAGE MIMIC: re-detect every turn in DISCOVERY ────────────
    # If customer speaks Hindi mid-conversation (even after choosing English),
    # we immediately mirror it. Their LIVE language beats their earlier choice.
    if session.state == ConversationState.DISCOVERY:
        live_lang = _detect_language(user_input)
        # Update only if clearly Hindi/Hinglish — don't flip on short English words
        if live_lang in ("hindi", "hinglish"):
            session.lead["preferred_language"] = live_lang
            session.language = live_lang
        elif live_lang == "english" and session.lead.get("preferred_language") == "english":
            session.language = "english"

    # ── BUSY ─────────────────────────────────────────────────────────────────
    if any(kw in user_lower for kw in BUSY_KEYWORDS):
        session.state   = ConversationState.ENDED
        session.outcome = "Customer Busy — Will Call Back"
        session.ended_at = datetime.now().isoformat()
        lang = _eff_lang(session, user_input)
        is_female = detect_gender(session.lead["name"]) == "Madam"
        if lang in ("hindi", "hinglish"):
            gi = "gi" if is_female else "ga"
            agent_text = (
                f"Samajh {('gayi' if is_female else 'gaya')}. "
                f"Main aapko thodi der baad call karun{gi}. "
                f"{CALL_ENDING_HINDI}"
            )
        else:
            agent_text = f"Understood. We will call you at a convenient time. {CALL_ENDING_MESSAGE}"
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=True)

    # ── ESCALATION ───────────────────────────────────────────────────────────
    # call_ended=False so the popup shows while the call stays open on screen.
    if any(kw in user_lower for kw in ESCALATION_KEYWORDS):
        session.escalated = True
        session.state     = ConversationState.ESCALATION
        session.outcome   = "Escalated to Human Executive"
        # Do NOT set ended_at — call stays "alive" until human takes over
        lang = _eff_lang(session, user_input)
        if lang in ("hindi", "hinglish"):
            agent_text = (
                "Ji zaroor. Main aapko abhi ek senior executive se connect kar rahi hoon. "
                "Ek moment please."
            )
        else:
            agent_text = (
                "Certainly. I am connecting you to a senior executive right away. "
                "Please hold for a moment."
            )
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=False, escalated=True)

    # ── NATURAL CLOSING ───────────────────────────────────────────────────────
    customer_ending = any(kw in user_lower for kw in END_KEYWORDS)
    long_call       = session.turn_count >= 24 and not session._wrap_up_sent

    if customer_ending or long_call:
        session._wrap_up_sent = True
        session.state   = ConversationState.ENDED
        session.outcome = "Completed — Requirements Gathered"
        session.ended_at = datetime.now().isoformat()

        prefs   = session.lead.get("preferences", {})
        summary = _build_summary(prefs)
        lang    = _eff_lang(session, user_input)

        if lang in ("hindi", "hinglish"):
            agent_text = (
                f"Aapki saari details note kar li hain: {summary}. "
                f"Hamari team jaldi hi aapse sampark karegi. "
                f"Koi bhi sawaal ho toh 1800-209-7272 pe call kar sakte hain. "
                f"{CALL_ENDING_HINDI}"
            )
        else:
            agent_text = (
                f"I have noted down {summary}. "
                f"Our team will get in touch with you shortly. "
                f"For any queries, reach us at 1800-209-7272. "
                f"{CALL_ENDING_MESSAGE}"
            )
        session.add_turn("agent", agent_text)
        return _make_result(agent_text, session, call_ended=True)

    # ── Normal LLM turn — language mimicked via _build_messages ──────────────
    agent_text = await get_ai_response(session, user_input)
    session.add_turn("agent", agent_text)
    return _make_result(agent_text, session, call_ended=False)


def _make_result(agent_text: str, session: "CallSession",
                 call_ended: bool, escalated: bool = False) -> dict:
    return {
        "agent_text": agent_text,
        "state":      session.state,
        "options":    None,
        "escalated":  escalated or session.escalated,
        "call_ended": call_ended,
    }


# ─── Opening Message ─────────────────────────────────────────────────────────

def get_opening_message(lead: dict) -> str:
    """Identity-only opening in the customer's preferred language."""
    first_name = lead["name"].split()[0]
    lang = lead.get("preferred_language", "")
    if lang == "hindi":
        return f"Namaste {first_name} ji, main Maya bol rahi hoon Škoda Auto India se."
    if lang == "hinglish":
        return f"Hello {first_name}, main Maya bol rahi hoon Škoda Auto India se."
    return f"Hello {first_name}, this is Maya calling from Škoda Auto India."
