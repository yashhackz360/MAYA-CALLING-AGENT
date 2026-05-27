"""
In-memory lead store — MantaRay AI · Škoda India Customer Data.
Three primary demo leads (Priya / Pooja / Dia) cover the three language modes
(English / Hindi / Hinglish). Background leads fill out the CRM.
"""

from datetime import datetime, timedelta
import uuid


SAMPLE_LEADS = [

    # ══════════════════════════════════════════════════════════════════════
    # PRIMARY DEMO LEADS — language-specific, used for live demo calls
    # ══════════════════════════════════════════════════════════════════════

    {
        "lead_id": "lead_001",
        "name": "Priya Sharma",
        "phone": "+91 98765 43210",
        "email": "priya.sharma@infosys.com",
        "source": "Website",
        "preferred_language": "english",
        "status": "New",
        "tag": "Hot",
        "created_at": (datetime.now() - timedelta(hours=1, minutes=30)).isoformat(),
        "preferences": {
            "location": "Bangalore",
            "vehicle_model": "Škoda Kushaq",
            "variant": "Style",
            "budget": "₹16–18 Lakhs",
            "transmission": "Automatic",
            "enquiry_type": "New Purchase",
            "purpose": "Daily commute + weekend trips",
            "notes": (
                "Senior Software Engineer at Infosys, Whitefield. Age 29. "
                "Visited our Whitefield showroom last Saturday and took a Kushaq Style 1.5 TSI AT test drive. "
                "Very impressed — specifically wants Tornado Red with Ivory interior and ventilated seats. "
                "Comparing with Hyundai Creta and MG Hector but leaning toward Škoda for build quality. "
                "Plans to buy within 6 weeks. Finance via HDFC. Wants home visit for paperwork."
            )
        },
        "call_history": [],
        "engagement": "Very High",
        "intent": "Purchase",
        "urgency": "High",
        "fit": "Excellent",
        "assigned_agent": "Maya",
        "campaign": "Kushaq Style Summer Drive 2024"
    },

    {
        "lead_id": "lead_002",
        "name": "Pooja Malhotra",
        "phone": "+91 99012 34567",
        "email": "pooja.malhotra@hdfcbank.com",
        "source": "Google Ads",
        "preferred_language": "hindi",
        "status": "New",
        "tag": "Warm",
        "created_at": (datetime.now() - timedelta(hours=3)).isoformat(),
        "preferences": {
            "location": "Mumbai",
            "vehicle_model": "Škoda Slavia",
            "variant": "Monte Carlo",
            "budget": "₹17–20 Lakhs",
            "transmission": "DSG",
            "enquiry_type": "New Purchase",
            "purpose": "Upgrade from Maruti Ciaz",
            "notes": (
                "Branch Manager at HDFC Bank, Andheri West. Age 36. "
                "Saw our Google ad for Slavia Monte Carlo 1.5 TSI DSG. First Škoda enquiry — upgrading from Ciaz. "
                "Strongly prefers Hindi. Wants detailed EMI breakdown (SBI at 8.5% vs HDFC at 8.75%). "
                "Open to Spine Blue or Carbon Steel colour. Hasn't visited showroom yet. "
                "Husband also interested — both need to see the car together. Prefers weekend appointment."
            )
        },
        "call_history": [],
        "engagement": "Medium",
        "intent": "Purchase",
        "urgency": "Medium",
        "fit": "Good",
        "assigned_agent": "Maya",
        "campaign": "Slavia Premium Campaign Q2"
    },

    {
        "lead_id": "lead_003",
        "name": "Dia Mehta",
        "phone": "+91 91234 56789",
        "email": "dia.mehta@google.com",
        "source": "Instagram Ad",
        "preferred_language": "hinglish",
        "status": "New",
        "tag": "Hot",
        "created_at": (datetime.now() - timedelta(minutes=45)).isoformat(),
        "preferences": {
            "location": "Hyderabad",
            "vehicle_model": "Škoda Kodiaq",
            "variant": "Sportline",
            "budget": "₹40–44 Lakhs",
            "transmission": "Automatic",
            "enquiry_type": "New Purchase",
            "purpose": "Family SUV + weekend road trips",
            "notes": (
                "Growth Marketing Manager at Google India, Hyderabad. Age 26. "
                "Saw Kodiaq Sportline on Instagram Reels — enquired immediately via the ad link. "
                "Very enthusiastic, responds fast on WhatsApp. Uses Hinglish naturally. "
                "Wants AWD, panoramic sunroof, Canton audio, connected features (SmartLink). "
                "Comparing with BMW X1 and Jeep Compass but prefers Škoda for value. "
                "Ready to book test drive this weekend at Jubilee Hills showroom. High purchase intent."
            )
        },
        "call_history": [],
        "engagement": "Very High",
        "intent": "Purchase",
        "urgency": "Very High",
        "fit": "Excellent",
        "assigned_agent": "Maya",
        "campaign": "Kodiaq Premium Lifestyle"
    },

    # ══════════════════════════════════════════════════════════════════════
    # BACKGROUND LEADS — support CRM analytics and dashboard counts
    # ══════════════════════════════════════════════════════════════════════

    {
        "lead_id": "lead_004",
        "name": "Rahul Mehta",
        "phone": "+91 87654 32109",
        "email": "rahul.mehta@wipro.com",
        "source": "Showroom Walk-in",
        "preferred_language": "english",
        "status": "Contacted",
        "tag": "Warm",
        "created_at": (datetime.now() - timedelta(days=1)).isoformat(),
        "preferences": {
            "location": "Bangalore",
            "vehicle_model": "Škoda Slavia",
            "variant": "Monte Carlo",
            "budget": "₹16–18 Lakhs",
            "transmission": "DSG",
            "enquiry_type": "New Purchase",
            "notes": "Sedan enthusiast. Comparing with Honda City and Hyundai Verna. Wants 1.5 TSI DSG."
        },
        "call_history": [
            {
                "call_id": "CALL-HIST01",
                "timestamp": (datetime.now() - timedelta(hours=20)).isoformat(),
                "duration": "4:12",
                "status": "Completed",
                "outcome": "Shared Slavia Monte Carlo brochure and EMI sheet. Follow-up call scheduled."
            }
        ],
        "engagement": "Medium",
        "intent": "Exploring",
        "urgency": "Medium",
        "fit": "Good",
        "assigned_agent": "Maya",
        "campaign": "Slavia Premium Campaign Q2"
    },

    {
        "lead_id": "lead_005",
        "name": "Vikram Krishnamurthy",
        "phone": "+91 65432 10987",
        "email": "vikram.k@tcs.com",
        "source": "Service Centre",
        "preferred_language": "english",
        "status": "Qualified",
        "tag": "Warm",
        "created_at": (datetime.now() - timedelta(days=2)).isoformat(),
        "preferences": {
            "location": "Bangalore",
            "vehicle_model": "Škoda Rapid",
            "enquiry_type": "Service",
            "notes": "Owns 2019 Rapid TSI. Due for 60,000 km service. Wants extended warranty and Škoda Shield quote."
        },
        "call_history": [],
        "engagement": "Medium",
        "intent": "Service",
        "urgency": "Low",
        "fit": "Good",
        "assigned_agent": "Maya",
        "campaign": "After-Sales Care 2024"
    },

    {
        "lead_id": "lead_006",
        "name": "Anjali Singh",
        "phone": "+91 93456 78901",
        "email": "anjali.singh@infosys.com",
        "source": "Referral",
        "preferred_language": "hindi",
        "status": "New",
        "tag": "Hot",
        "created_at": (datetime.now() - timedelta(hours=6)).isoformat(),
        "preferences": {
            "location": "Delhi NCR",
            "vehicle_model": "Škoda Kushaq",
            "variant": "Ambition",
            "budget": "₹13–15 Lakhs",
            "transmission": "Manual",
            "enquiry_type": "New Purchase",
            "notes": "Referred by existing Škoda owner (Kushaq Style). Wants Hindi communication. First-time buyer."
        },
        "call_history": [],
        "engagement": "High",
        "intent": "Purchase",
        "urgency": "High",
        "fit": "Good",
        "assigned_agent": "Maya",
        "campaign": "Kushaq Style Summer Drive 2024"
    },

    {
        "lead_id": "lead_007",
        "name": "Aditya Kulkarni",
        "phone": "+91 77890 12345",
        "email": "aditya.kulkarni@persistent.com",
        "source": "Instagram Ad",
        "preferred_language": "hinglish",
        "status": "New",
        "tag": "Warm",
        "created_at": (datetime.now() - timedelta(hours=8)).isoformat(),
        "preferences": {
            "location": "Pune",
            "vehicle_model": "Škoda Kushaq",
            "variant": "Monte Carlo",
            "budget": "₹16–19 Lakhs",
            "transmission": "DSG",
            "enquiry_type": "New Purchase",
            "notes": "Young professional at Persistent Systems. Loves Monte Carlo sporty look. Wants ventilated seats and wireless carplay."
        },
        "call_history": [],
        "engagement": "Medium",
        "intent": "Considering",
        "urgency": "Low",
        "fit": "Good",
        "assigned_agent": "Maya",
        "campaign": "Kushaq Monte Carlo Special"
    },

    {
        "lead_id": "lead_008",
        "name": "Ravi Shankar Rao",
        "phone": "+91 82345 67890",
        "email": "ravishankar.rao@cognizant.com",
        "source": "Website",
        "preferred_language": "english",
        "status": "New",
        "tag": "Hot",
        "created_at": (datetime.now() - timedelta(hours=2)).isoformat(),
        "preferences": {
            "location": "Hyderabad",
            "vehicle_model": "Škoda Superb",
            "variant": "Laurin & Klement",
            "budget": "₹36–40 Lakhs",
            "transmission": "DSG",
            "enquiry_type": "New Purchase",
            "notes": "Senior Director at Cognizant. Upgrading from Octavia. Wants Canton sound, virtual cockpit, and 8-airbag safety."
        },
        "call_history": [],
        "engagement": "High",
        "intent": "Purchase",
        "urgency": "High",
        "fit": "Excellent",
        "assigned_agent": "Maya",
        "campaign": "Superb Flagship Campaign"
    },

]

# ─── In-memory store (mutated at runtime by create_lead) ─────────────────────

_leads_db: list[dict] = list(SAMPLE_LEADS)


def get_all_leads() -> list[dict]:
    return _leads_db


def get_lead(lead_id: str) -> dict | None:
    return next((l for l in _leads_db if l["lead_id"] == lead_id), None)


def create_lead(data: dict) -> dict:
    lead = {
        "lead_id":     f"lead_{str(uuid.uuid4())[:8]}",
        "name":        data.get("name", "Unknown"),
        "phone":       data.get("phone", ""),
        "email":       data.get("email", ""),
        "source":      data.get("source", "Enquiry Form"),
        "preferred_language": data.get("preferred_language", ""),
        "status":      "New",
        "tag":         "Warm",
        "created_at":  datetime.now().isoformat(),
        "preferences": data.get("preferences", {}),
        "call_history": [],
        "engagement":  "Low",
        "intent":      "Enquiry",
        "urgency":     "Low",
        "fit":         "Unknown",
        "assigned_agent": "Maya",
        "campaign":    "Direct Enquiry",
        "contact_consent":       data.get("contact_consent", True),
        "communication_consent": data.get("communication_consent", False),
    }
    _leads_db.insert(0, lead)
    return lead


def find_duplicate_lead(phone: str, email: str) -> dict | None:
    """Return an existing lead that matches phone (primary) or email (secondary)."""
    phone_clean = phone.replace(" ", "").replace("-", "").strip() if phone else ""
    email_clean = email.strip().lower() if email else ""
    for lead in _leads_db:
        if phone_clean:
            existing_phone = lead.get("phone", "").replace(" ", "").replace("-", "").strip()
            if existing_phone and existing_phone == phone_clean:
                return lead
        if email_clean:
            existing_email = lead.get("email", "").strip().lower()
            if existing_email and existing_email == email_clean:
                return lead
    return None


def merge_lead(lead_id: str, new_data: dict) -> dict:
    """Merge a new enquiry into an existing lead. Updates info, logs re-enquiry."""
    lead = get_lead(lead_id)
    if not lead:
        return {}

    # Track enquiry count
    lead["enquiry_count"] = lead.get("enquiry_count", 1) + 1

    # Append re-enquiry note to call history
    lead.setdefault("call_history", []).append({
        "call_id":   f"RE-ENQUIRY-{lead['enquiry_count']}",
        "timestamp": datetime.now().isoformat(),
        "duration":  "—",
        "status":    "Re-enquiry",
        "outcome":   f"Returned via {new_data.get('source', 'enquiry form')} — enquiry #{lead['enquiry_count']}",
    })

    # Merge preferences (new values win for non-empty fields)
    new_prefs = new_data.get("preferences", {})
    if new_prefs:
        lead.setdefault("preferences", {}).update({k: v for k, v in new_prefs.items() if v})

    # Update top-level fields only if new value is non-empty
    for field in ("source", "preferred_language", "address"):
        if new_data.get(field):
            lead[field] = new_data[field]

    # Upgrade urgency — a returning lead is more serious
    lead["status"] = "Re-enquiry"
    if lead.get("tag") == "Cold":
        lead["tag"] = "Warm"

    lead["last_enquiry_at"] = datetime.now().isoformat()
    return lead


def update_lead_status(lead_id: str, status: str, tag: str = None) -> None:
    lead = get_lead(lead_id)
    if lead:
        lead["status"] = status
        if tag:
            lead["tag"] = tag


def update_lead(lead_id: str, patch: dict) -> None:
    """Merge patch into the lead record; nested 'preferences' are merged, not replaced."""
    lead = get_lead(lead_id)
    if not lead:
        return
    prefs_patch = patch.get("preferences", None)
    for key, val in patch.items():
        if key != "preferences":
            lead[key] = val
    if prefs_patch:
        lead.setdefault("preferences", {}).update(prefs_patch)
    lead["updated_at"] = datetime.now().isoformat()


def delete_lead(lead_id: str) -> bool:
    global _leads_db
    before = len(_leads_db)
    _leads_db = [l for l in _leads_db if l["lead_id"] != lead_id]
    return len(_leads_db) < before


def add_call_to_lead(lead_id: str, call_record: dict) -> None:
    lead = get_lead(lead_id)
    if lead:
        lead.setdefault("call_history", []).append(call_record)


_call_logs: list[dict] = []

def add_call_log(log: dict) -> None:
    _call_logs.append(log)


def update_call_log(call_id: str, patch: dict) -> None:
    """Find a call log entry by call_id and merge patch into it in-place."""
    for entry in _call_logs:
        if entry.get("call_id") == call_id:
            entry.update(patch)
            return


def get_call_logs() -> list[dict]:
    runtime_logs = list(_call_logs)
    for lead in _leads_db:
        for call in lead.get("call_history", []):
            entry = {**call, "lead_name": lead["name"], "lead_id": lead["lead_id"]}
            if not any(l.get("call_id") == entry.get("call_id") for l in runtime_logs):
                runtime_logs.append(entry)
    return sorted(runtime_logs, key=lambda x: x.get("timestamp", ""), reverse=True)


def get_analytics() -> dict:
    total    = len(_leads_db)
    hot      = sum(1 for l in _leads_db if l.get("tag") == "Hot")
    warm     = sum(1 for l in _leads_db if l.get("tag") == "Warm")
    cold     = sum(1 for l in _leads_db if l.get("tag") == "Cold")
    contact  = sum(1 for l in _leads_db if l.get("status") == "Contacted")
    qual     = sum(1 for l in _leads_db if l.get("status") == "Qualified")
    all_calls = get_call_logs()
    today    = datetime.now().date().isoformat()
    calls_today = sum(1 for c in all_calls if c.get("timestamp", "").startswith(today))
    return {
        "total_leads":      total,
        "hot_leads":        hot,
        "warm_leads":       warm,
        "cold_leads":       cold,
        "contacted":        contact,
        "qualified":        qual,
        "calls_today":      calls_today,
        "total_calls":      len(all_calls),
        "conversion_rate":  round((qual / total * 100) if total else 0, 1),
        "monthly_revenue":  "₹14,20,000",
        "pipeline_value":   "₹9,80,00,000",
    }


def get_campaigns() -> list[dict]:
    campaign_map: dict[str, dict] = {}
    for lead in _leads_db:
        name = lead.get("campaign", "General")
        if name not in campaign_map:
            campaign_map[name] = {"name": name, "leads": 0, "hot": 0}
        campaign_map[name]["leads"] += 1
        if lead.get("tag") == "Hot":
            campaign_map[name]["hot"] += 1
    return list(campaign_map.values())
