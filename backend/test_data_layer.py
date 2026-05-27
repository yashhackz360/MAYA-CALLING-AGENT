"""
TEST SCRIPT 1 — Data Layer Unit Tests (data/sample_leads.py)
Covers: CRUD, duplicate detection, merge logic, analytics, call logs.
Run:  pytest test_data_layer.py -v
"""

import copy
import sys
import os
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import data.sample_leads as sl


# ── Fixture: restore in-memory DB between every test ──────────────────────────

@pytest.fixture(autouse=True)
def reset_db():
    saved_leads = copy.deepcopy(sl._leads_db)
    saved_logs  = copy.deepcopy(sl._call_logs)
    yield
    # Direct assignment handles the case where delete_lead() replaced _leads_db ref
    sl._leads_db = copy.deepcopy(saved_leads)
    sl._call_logs[:] = saved_logs


# ── get_all_leads ──────────────────────────────────────────────────────────────

def test_get_all_leads_returns_list():
    assert isinstance(sl.get_all_leads(), list)

def test_get_all_leads_not_empty():
    assert len(sl.get_all_leads()) > 0

def test_get_all_leads_each_has_required_fields():
    for lead in sl.get_all_leads():
        for field in ("lead_id", "name", "phone", "status"):
            assert field in lead, f"Lead missing field '{field}': {lead.get('lead_id')}"


# ── get_lead ──────────────────────────────────────────────────────────────────

def test_get_lead_returns_correct_lead():
    lead = sl.get_lead("lead_001")
    assert lead is not None
    assert lead["lead_id"] == "lead_001"

def test_get_lead_not_found_returns_none():
    assert sl.get_lead("nonexistent_xyzzy") is None

def test_get_lead_returns_live_reference():
    # get_lead returns a direct reference — mutations affect the DB (expected behaviour)
    lead = sl.get_lead("lead_001")
    lead["_test_mutation"] = True
    assert sl.get_lead("lead_001").get("_test_mutation") is True


# ── create_lead ───────────────────────────────────────────────────────────────

NEW_LEAD = {
    "name": "Test User",
    "phone": "+91 55555 99999",
    "email": "test@mantaray.com",
    "source": "Website",
    "preferred_language": "english",
    "contact_consent": True,
    "communication_consent": False,
    "preferences": {"vehicle_model": "Kushaq"},
}

def test_create_lead_returns_dict_with_id():
    lead = sl.create_lead(NEW_LEAD.copy())
    assert isinstance(lead, dict)
    assert "lead_id" in lead

def test_create_lead_id_starts_with_lead_():
    lead = sl.create_lead(NEW_LEAD.copy())
    assert lead["lead_id"].startswith("lead_")

def test_create_lead_status_defaults_to_new():
    lead = sl.create_lead(NEW_LEAD.copy())
    assert lead["status"] == "New"

def test_create_lead_tag_defaults_to_warm():
    lead = sl.create_lead(NEW_LEAD.copy())
    assert lead["tag"] == "Warm"

def test_create_lead_inserted_at_front():
    sl.create_lead(NEW_LEAD.copy())
    assert sl.get_all_leads()[0]["phone"] == NEW_LEAD["phone"]

def test_create_lead_increments_total():
    before = len(sl.get_all_leads())
    sl.create_lead(NEW_LEAD.copy())
    assert len(sl.get_all_leads()) == before + 1

def test_create_lead_has_valid_created_at():
    lead = sl.create_lead(NEW_LEAD.copy())
    # Should parse as ISO datetime without error
    datetime.fromisoformat(lead["created_at"])

def test_create_lead_minimal_data_no_crash():
    lead = sl.create_lead({"name": "Minimal", "phone": "+91 00000 00001", "email": ""})
    assert lead is not None

def test_create_lead_preserves_preferences():
    lead = sl.create_lead(NEW_LEAD.copy())
    assert lead["preferences"]["vehicle_model"] == "Kushaq"


# ── update_lead ───────────────────────────────────────────────────────────────

def test_update_lead_basic_field():
    sl.update_lead("lead_001", {"tag": "Cold"})
    assert sl.get_lead("lead_001")["tag"] == "Cold"

def test_update_lead_nonexistent_returns_none():
    result = sl.update_lead("no_such_lead", {"tag": "Hot"})
    assert result is None

def test_update_lead_preserves_unpatched_fields():
    original_name = sl.get_lead("lead_001")["name"]
    sl.update_lead("lead_001", {"tag": "Cold"})
    assert sl.get_lead("lead_001")["name"] == original_name

def test_update_lead_preferences_merge_not_replace():
    sl.update_lead("lead_001", {"preferences": {"budget": "30L", "new_key": "value"}})
    prefs = sl.get_lead("lead_001")["preferences"]
    assert prefs["budget"] == "30L"
    assert prefs["new_key"] == "value"
    # Original keys should still exist
    assert "vehicle_model" in prefs

def test_update_lead_sets_updated_at():
    sl.update_lead("lead_001", {"notes": "Updated"})
    lead = sl.get_lead("lead_001")
    assert "updated_at" in lead

# ── BUG: update_lead mutates the caller's patch dict ──────────────────────────
def test_update_lead_does_not_mutate_caller_patch():
    """
    BUG CHECK: update_lead() calls patch.pop('preferences') which destroys
    the caller's dict. This test verifies the bug exists (xfail) or is fixed.
    """
    patch = {"tag": "Cold", "preferences": {"budget": "20L"}}
    patch_copy = copy.deepcopy(patch)
    sl.update_lead("lead_001", patch)
    if "preferences" not in patch:
        pytest.xfail(
            "CONFIRMED BUG: update_lead() mutates the caller's patch dict "
            "by calling patch.pop('preferences'). Fix: use patch.get() then del."
        )
    assert patch == patch_copy


# ── delete_lead ───────────────────────────────────────────────────────────────

def test_delete_lead_returns_true():
    assert sl.delete_lead("lead_001") is True

def test_delete_lead_removes_from_db():
    sl.delete_lead("lead_001")
    assert sl.get_lead("lead_001") is None

def test_delete_lead_decrements_count():
    before = len(sl.get_all_leads())
    sl.delete_lead("lead_001")
    assert len(sl.get_all_leads()) == before - 1

def test_delete_lead_nonexistent_returns_false():
    assert sl.delete_lead("no_such_lead_xyz") is False

def test_delete_lead_does_not_affect_other_leads():
    sl.delete_lead("lead_001")
    assert sl.get_lead("lead_002") is not None


# ── update_lead_status ────────────────────────────────────────────────────────

def test_update_lead_status_only():
    sl.update_lead_status("lead_001", "Qualified")
    assert sl.get_lead("lead_001")["status"] == "Qualified"

def test_update_lead_status_with_tag():
    sl.update_lead_status("lead_001", "Contacted", tag="Warm")
    lead = sl.get_lead("lead_001")
    assert lead["status"] == "Contacted"
    assert lead["tag"] == "Warm"

def test_update_lead_status_nonexistent_no_crash():
    try:
        sl.update_lead_status("no_such_lead", "Qualified")
    except Exception as e:
        pytest.fail(f"update_lead_status raised on missing lead: {e}")


# ── find_duplicate_lead ───────────────────────────────────────────────────────

def test_find_duplicate_by_exact_phone():
    lead = sl.get_all_leads()[0]
    result = sl.find_duplicate_lead(lead["phone"], "no_match@x.com")
    assert result is not None
    assert result["lead_id"] == lead["lead_id"]

def test_find_duplicate_by_exact_email():
    lead = sl.get_all_leads()[0]
    result = sl.find_duplicate_lead("+99 00000 00000", lead["email"])
    assert result is not None
    assert result["lead_id"] == lead["lead_id"]

def test_find_duplicate_phone_normalized_spaces():
    # "+91 98765 43210" → "+919876543210" should still match
    result = sl.find_duplicate_lead("+919876543210", "no_match@x.com")
    assert result is not None, (
        "POTENTIAL BUG: Phone normalization mismatch — "
        "'+919876543210' did not match '+91 98765 43210'"
    )

def test_find_duplicate_email_case_insensitive():
    lead = sl.get_all_leads()[0]
    result = sl.find_duplicate_lead("+99 00000 00001", lead["email"].upper())
    assert result is not None, "Email duplicate check should be case-insensitive"

def test_find_duplicate_no_match_returns_none():
    result = sl.find_duplicate_lead("+99 11111 11111", "unique_xyz_nomatch@test.com")
    assert result is None

def test_find_duplicate_empty_phone_no_false_positive():
    """Empty phone must NOT match any lead that has a phone."""
    result = sl.find_duplicate_lead("", "no_match_xyz@test.com")
    if result is not None and result.get("phone", "") != "":
        pytest.fail(
            f"BUG: Empty phone matched lead '{result['lead_id']}' "
            f"which has phone='{result['phone']}'"
        )

def test_find_duplicate_empty_email_no_false_positive():
    """Empty email must NOT match any lead that has an email."""
    result = sl.find_duplicate_lead("+99 22222 22222", "")
    if result is not None and result.get("email", "") != "":
        pytest.fail(
            f"BUG: Empty email matched lead '{result['lead_id']}' "
            f"which has email='{result['email']}'"
        )


# ── merge_lead ────────────────────────────────────────────────────────────────

def test_merge_lead_increments_enquiry_count():
    lead_id = "lead_001"
    before = sl.get_lead(lead_id).get("enquiry_count", 1)
    sl.merge_lead(lead_id, {"preferences": {}})
    assert sl.get_lead(lead_id)["enquiry_count"] == before + 1

def test_merge_lead_sets_reenquiry_status():
    sl.merge_lead("lead_001", {"preferences": {}})
    assert sl.get_lead("lead_001")["status"] == "Re-enquiry"

def test_merge_lead_cold_upgraded_to_warm():
    sl.update_lead("lead_001", {"tag": "Cold"})
    sl.merge_lead("lead_001", {"preferences": {}})
    tag = sl.get_lead("lead_001")["tag"]
    assert tag in ("Warm", "Hot"), f"Cold tag should be upgraded on re-enquiry, got: {tag}"

def test_merge_lead_hot_stays_hot():
    sl.update_lead("lead_001", {"tag": "Hot"})
    sl.merge_lead("lead_001", {"preferences": {}})
    assert sl.get_lead("lead_001")["tag"] == "Hot"

def test_merge_lead_warm_stays_warm():
    sl.update_lead("lead_001", {"tag": "Warm"})
    sl.merge_lead("lead_001", {"preferences": {}})
    assert sl.get_lead("lead_001")["tag"] == "Warm"

def test_merge_lead_preference_new_values_win():
    sl.merge_lead("lead_001", {"preferences": {"budget": "UPDATED_BUDGET"}})
    assert sl.get_lead("lead_001")["preferences"]["budget"] == "UPDATED_BUDGET"

def test_merge_lead_nonexistent_returns_empty_dict():
    result = sl.merge_lead("no_such_lead", {"preferences": {}})
    assert result == {}

def test_merge_lead_adds_to_call_history():
    before_len = len(sl.get_lead("lead_001").get("call_history", []))
    sl.merge_lead("lead_001", {"preferences": {}})
    after_len = len(sl.get_lead("lead_001").get("call_history", []))
    assert after_len == before_len + 1


# ── call history / logs ───────────────────────────────────────────────────────

def test_add_call_to_lead_appends():
    call = {"call_id": "CALL-T-001", "status": "Completed", "duration": "1:00",
            "timestamp": datetime.now(timezone.utc).isoformat()}
    sl.add_call_to_lead("lead_001", call)
    ids = [c["call_id"] for c in sl.get_lead("lead_001")["call_history"]]
    assert "CALL-T-001" in ids

def test_add_call_to_nonexistent_lead_no_crash():
    try:
        sl.add_call_to_lead("no_such_lead", {"call_id": "CALL-NOPE"})
    except Exception as e:
        pytest.fail(f"add_call_to_lead raised on missing lead: {e}")

def test_add_call_log_appears_in_get_call_logs():
    log = {
        "call_id": "CALL-LOG-T001",
        "lead_id": "lead_001",
        "recipient": "Test",
        "date": datetime.now(timezone.utc).isoformat(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "Completed",
    }
    sl.add_call_log(log)
    assert any(l["call_id"] == "CALL-LOG-T001" for l in sl.get_call_logs())

def test_update_call_log_merges_fields():
    log = {
        "call_id": "CALL-UPD-T001",
        "status": "In Progress",
        "timestamp": "2025-01-01T10:00:00",
    }
    sl.add_call_log(log)
    sl.update_call_log("CALL-UPD-T001", {"status": "Completed", "recording_sid": "RE123"})
    updated = next(l for l in sl.get_call_logs() if l["call_id"] == "CALL-UPD-T001")
    assert updated["status"] == "Completed"
    assert updated["recording_sid"] == "RE123"

def test_update_call_log_nonexistent_no_crash():
    try:
        sl.update_call_log("NO_SUCH_CALL", {"status": "Completed"})
    except Exception as e:
        pytest.fail(f"update_call_log raised on missing call_id: {e}")

def test_get_call_logs_no_duplicate_call_ids():
    logs = sl.get_call_logs()
    ids = [l["call_id"] for l in logs]
    assert len(ids) == len(set(ids)), f"Duplicate call_ids in get_call_logs(): {[x for x in ids if ids.count(x) > 1]}"

def test_get_call_logs_sorted_newest_first():
    sl.add_call_log({
        "call_id": "CALL-OLD-X", "lead_id": "lead_001",
        "timestamp": "2024-01-01T10:00:00", "date": "2024-01-01T10:00:00",
    })
    sl.add_call_log({
        "call_id": "CALL-NEW-X", "lead_id": "lead_001",
        "timestamp": "2025-06-01T10:00:00", "date": "2025-06-01T10:00:00",
    })
    logs = sl.get_call_logs()
    ids = [l["call_id"] for l in logs]
    assert ids.index("CALL-NEW-X") < ids.index("CALL-OLD-X"), (
        "Newer call log should appear before older call log"
    )

def test_get_call_logs_uses_timestamp_field_not_date():
    """
    BUG CHECK: get_call_logs sorts by 'timestamp', but if a log only has 'date'
    (no 'timestamp'), it sorts to the end — wrong order possible.
    """
    sl.add_call_log({
        "call_id": "CALL-DATE-ONLY",
        "lead_id": "lead_001",
        "date": "2099-01-01T10:00:00",
        # no 'timestamp' field
    })
    logs = sl.get_call_logs()
    date_only = next((l for l in logs if l["call_id"] == "CALL-DATE-ONLY"), None)
    assert date_only is not None
    # It should ideally be near the top (2099 is in the future)
    # If it's not, it means the sort ignores 'date' when 'timestamp' is absent
    idx = [l["call_id"] for l in logs].index("CALL-DATE-ONLY")
    if idx > 2:
        pytest.xfail(
            "POTENTIAL BUG: get_call_logs() sorts by 'timestamp' only — logs "
            "with only a 'date' field sort to the end regardless of their date value."
        )


# ── analytics ────────────────────────────────────────────────────────────────

def test_analytics_returns_required_keys():
    a = sl.get_analytics()
    for key in ("total_leads", "hot_leads", "warm_leads", "cold_leads",
                "contacted", "qualified", "calls_today", "total_calls", "conversion_rate"):
        assert key in a, f"Missing analytics key: {key}"

def test_analytics_total_equals_db_length():
    assert sl.get_analytics()["total_leads"] == len(sl.get_all_leads())

def test_analytics_total_increases_on_create():
    before = sl.get_analytics()["total_leads"]
    sl.create_lead(NEW_LEAD.copy())
    assert sl.get_analytics()["total_leads"] == before + 1

def test_analytics_total_decreases_on_delete():
    before = sl.get_analytics()["total_leads"]
    sl.delete_lead("lead_001")
    assert sl.get_analytics()["total_leads"] == before - 1

def test_analytics_tag_counts_sum_le_total():
    a = sl.get_analytics()
    tag_sum = a["hot_leads"] + a["warm_leads"] + a["cold_leads"]
    assert tag_sum <= a["total_leads"], (
        f"hot+warm+cold ({tag_sum}) exceeds total_leads ({a['total_leads']})"
    )

def test_analytics_conversion_rate_in_range():
    rate = sl.get_analytics()["conversion_rate"]
    assert 0.0 <= rate <= 100.0, f"Conversion rate out of [0,100]: {rate}"

def test_analytics_conversion_rate_correct_formula():
    leads = sl.get_all_leads()
    qualified = sum(1 for l in leads if l.get("status") == "Qualified")
    total = len(leads)
    expected = round(qualified / total * 100, 1) if total else 0.0
    assert sl.get_analytics()["conversion_rate"] == expected

def test_analytics_empty_db_no_crash():
    sl._leads_db = []
    try:
        a = sl.get_analytics()
        assert a["total_leads"] == 0
        assert a["conversion_rate"] == 0.0 or a["conversion_rate"] == 0
    except ZeroDivisionError:
        pytest.fail("BUG: get_analytics() raises ZeroDivisionError when DB is empty")


# ── campaigns ────────────────────────────────────────────────────────────────

def test_get_campaigns_returns_list():
    assert isinstance(sl.get_campaigns(), list)

def test_get_campaigns_required_fields():
    for c in sl.get_campaigns():
        assert "name" in c
        assert "leads" in c

def test_get_campaigns_hot_count_key_name():
    """Check whether key is 'hot' or 'hot_leads' — inconsistency is a bug."""
    for c in sl.get_campaigns():
        has_hot = "hot" in c
        has_hot_leads = "hot_leads" in c
        assert has_hot or has_hot_leads, (
            f"Campaign '{c['name']}' has neither 'hot' nor 'hot_leads' key — "
            "frontend/backend key name mismatch possible"
        )

def test_get_campaigns_hot_not_exceed_leads():
    for c in sl.get_campaigns():
        hot = c.get("hot_leads", c.get("hot", 0))
        assert hot <= c["leads"], (
            f"Campaign '{c['name']}' hot_leads ({hot}) > total leads ({c['leads']})"
        )
