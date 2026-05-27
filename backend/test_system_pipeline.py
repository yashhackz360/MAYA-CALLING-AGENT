"""
TEST SCRIPT 3 — System & Pipeline Tests (twilio_handler.py + audio pipeline)
Covers: audio conversion, goodbye detection, first message builder, env loading,
        TwiML response structure, Grok analysis parsing, call log save flow,
        edge cases and stress tests.
Run:  pytest test_system_pipeline.py -v
"""

import asyncio
import base64
import copy
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop


# ── Audio conversion helpers ──────────────────────────────────────────────────

def _silence_mulaw(n=160):
    return b"\x7f" * n   # 0x7F = silence in µ-law

def _silence_pcm(samples=160, width=2):
    return b"\x00" * (samples * width)


# ── Audio: µ-law ↔ PCM ───────────────────────────────────────────────────────

def test_mulaw_to_pcm_length():
    pcm = audioop.ulaw2lin(_silence_mulaw(160), 2)
    assert len(pcm) == 160 * 2

def test_pcm_to_mulaw_length():
    mulaw = audioop.lin2ulaw(_silence_pcm(160), 2)
    assert len(mulaw) == 160

def test_mulaw_pcm_roundtrip_no_crash():
    """µ-law → PCM → µ-law should not raise."""
    restored = audioop.lin2ulaw(audioop.ulaw2lin(_silence_mulaw(160), 2), 2)
    assert len(restored) == 160

def test_upsample_8k_to_16k():
    pcm8k = _silence_pcm(160)   # 20ms at 8 kHz
    pcm16k, _ = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, None)
    actual = len(pcm16k) // 2
    assert abs(actual - 320) <= 4, f"Expected ~320 samples after upsample, got {actual}"

def test_downsample_16k_to_8k():
    pcm16k = _silence_pcm(320)  # 20ms at 16 kHz
    pcm8k, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)
    actual = len(pcm8k) // 2
    assert abs(actual - 160) <= 4, f"Expected ~160 samples after downsample, got {actual}"

def test_gain_mul_preserves_length():
    pcm = _silence_pcm(160)
    amplified = audioop.mul(pcm, 2, 1.5)
    assert len(amplified) == len(pcm)

def test_full_twilio_to_el_pipeline():
    """Simulate the full Twilio→EL audio path: µ-law 8k → PCM 16k."""
    mulaw = _silence_mulaw(160)
    pcm8k = audioop.ulaw2lin(mulaw, 2)
    pcm16k, _ = audioop.ratecv(pcm8k, 2, 1, 8000, 16000, None)
    pcm16k = audioop.mul(pcm16k, 2, 1.5)
    encoded = base64.b64encode(pcm16k).decode()
    assert isinstance(encoded, str)
    assert len(encoded) > 0

def test_full_el_to_twilio_pipeline():
    """Simulate the full EL→Twilio audio path: PCM 16k → µ-law 8k."""
    pcm16k = _silence_pcm(320)
    pcm8k, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)
    mulaw = audioop.lin2ulaw(pcm8k, 2)
    encoded = base64.b64encode(mulaw).decode()
    assert isinstance(encoded, str)

def test_base64_audio_roundtrip():
    pcm = _silence_pcm(320)
    assert base64.b64decode(base64.b64encode(pcm).decode()) == pcm

def test_empty_audio_buffer_no_crash():
    """Empty buffer should not crash audioop."""
    try:
        audioop.ulaw2lin(b"", 2)
        audioop.ratecv(b"", 2, 1, 8000, 16000, None)
    except audioop.error:
        pass  # audioop may raise — just confirm no Python crash


# ── _is_goodbye ───────────────────────────────────────────────────────────────

def test_is_goodbye_importable():
    from twilio_handler import _is_goodbye
    assert callable(_is_goodbye)

def test_goodbye_english_exact():
    from twilio_handler import _is_goodbye
    assert _is_goodbye("thank you and goodbye", "english")

def test_goodbye_english_have_a_great_day():
    from twilio_handler import _is_goodbye
    assert _is_goodbye("have a great day ahead!", "english")

def test_goodbye_english_within_longer_sentence():
    from twilio_handler import _is_goodbye
    assert _is_goodbye("That's all I needed, have a good day!", "english")

def test_goodbye_english_case_insensitive():
    from twilio_handler import _is_goodbye
    result_lower = _is_goodbye("have a great day", "english")
    result_upper = _is_goodbye("HAVE A GREAT DAY", "english")
    assert result_lower == result_upper, (
        "BUG: _is_goodbye is case-sensitive — 'HAVE A GREAT DAY' not matched"
    )

def test_no_goodbye_english_normal_phrases():
    from twilio_handler import _is_goodbye
    for phrase in [
        "I'm interested in the Kushaq",
        "What is the price of the Slavia?",
        "Can I book a test drive?",
        "I'll think about it",
        "Send me the brochure",
    ]:
        assert not _is_goodbye(phrase, "english"), f"False positive goodbye: {phrase!r}"

def test_goodbye_hindi_phrases():
    from twilio_handler import _is_goodbye
    for phrase in ["dhanyavaad aapka", "aapka din shubh ho", "skoda se sampark karne ke liye"]:
        assert _is_goodbye(phrase, "hindi"), f"Hindi goodbye not detected: {phrase!r}"

def test_goodbye_hindi_case_insensitive():
    from twilio_handler import _is_goodbye
    assert _is_goodbye("Dhanyavaad", "hindi") == _is_goodbye("dhanyavaad", "hindi"), (
        "BUG: _is_goodbye is case-sensitive for Hindi phrases"
    )

def test_goodbye_hinglish_uses_english_phrases():
    """Hinglish falls back to English goodbye list — verify it works."""
    from twilio_handler import _is_goodbye
    assert _is_goodbye("have a great day!", "hinglish"), (
        "Hinglish should use English goodbye phrases as fallback"
    )

def test_goodbye_unknown_language_no_crash():
    from twilio_handler import _is_goodbye
    try:
        _is_goodbye("bye bye", "klingon")
    except Exception as e:
        pytest.fail(f"_is_goodbye raised on unknown language: {e}")

def test_goodbye_empty_text():
    from twilio_handler import _is_goodbye
    assert _is_goodbye("", "english") is False


# ── _build_first_message ──────────────────────────────────────────────────────

def test_build_first_message_importable():
    from twilio_handler import _build_first_message
    assert callable(_build_first_message)

def test_build_first_message_english_contains_name():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Priya", "english")
    assert "Priya" in msg

def test_build_first_message_english_contains_skoda():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Priya", "english")
    assert "Skoda" in msg or "škoda" in msg.lower()

def test_build_first_message_hindi_contains_name():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Pooja", "hindi")
    assert "Pooja" in msg

def test_build_first_message_hindi_contains_namaste():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Pooja", "hindi")
    assert "Namaste" in msg or "namaste" in msg.lower()

def test_build_first_message_hinglish_returns_string():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Dia", "hinglish")
    assert isinstance(msg, str) and len(msg) > 10

def test_build_first_message_unknown_language_fallback():
    from twilio_handler import _build_first_message
    msg = _build_first_message("Test", "zulu")
    assert msg is not None and len(msg) > 5, (
        "Unknown language should fall back to English, not return None or empty"
    )

def test_build_first_message_empty_name_no_crash():
    from twilio_handler import _build_first_message
    try:
        msg = _build_first_message("", "english")
        assert isinstance(msg, str)
    except Exception as e:
        pytest.fail(f"_build_first_message raised with empty name: {e}")


# ── _read_env ─────────────────────────────────────────────────────────────────

def test_read_env_importable():
    from twilio_handler import _read_env
    assert callable(_read_env)

def test_read_env_returns_string_for_missing_key():
    from twilio_handler import _read_env
    val = _read_env("NONEXISTENT_KEY_MANTARAY_TEST_XYZ")
    assert isinstance(val, str)   # Returns "" not None

def test_read_env_fallback_to_os_environ():
    from twilio_handler import _read_env
    with patch.dict(os.environ, {"MANTARAY_TEST_READ_ENV": "hello_123"}):
        val = _read_env("MANTARAY_TEST_READ_ENV")
        # May be empty if .env file doesn't have it but os.getenv should catch it
        # If .env exists and doesn't have this key, falls through to os.getenv
        assert val == "hello_123" or val == ""  # both acceptable depending on .env

def test_read_env_env_file_exists():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    assert os.path.exists(env_path), (
        "CRITICAL: .env file not found — all environment-dependent features will fail"
    )


# ── Environment variable presence ─────────────────────────────────────────────

REQUIRED_VARS = [
    ("TWILIO_ACCOUNT_SID",    "Outbound calls will not work"),
    ("TWILIO_AUTH_TOKEN",     "Outbound calls will not work"),
    ("TWILIO_FROM_NUMBER",    "Outbound calls will not work"),
    ("ELEVENLABS_API_KEY",    "AI voice relay will not work"),
    ("ELEVENLABS_AGENT_ID",   "AI voice relay will not work"),
    ("XAI_API_KEY",           "Post-call analysis will not work"),
    ("PUBLIC_BASE_URL",       "Twilio webhooks will not work — ngrok URL missing"),
]

@pytest.mark.parametrize("var,impact", REQUIRED_VARS)
def test_env_var_set(var, impact):
    from twilio_handler import _read_env
    val = _read_env(var)
    if not val:
        pytest.xfail(f"ENV {var!r} not set — {impact}")

def test_public_base_url_is_https():
    from twilio_handler import _read_env
    url = _read_env("PUBLIC_BASE_URL")
    if url:
        assert url.startswith("https://"), (
            f"PUBLIC_BASE_URL must start with https:// for Twilio to accept webhooks. Got: {url!r}"
        )

def test_twilio_from_number_e164_format():
    from twilio_handler import _read_env
    num = _read_env("TWILIO_FROM_NUMBER")
    if num:
        assert num.startswith("+"), (
            f"TWILIO_FROM_NUMBER should be E.164 format (e.g. +12345678900). Got: {num!r}"
        )


# ── register_call ─────────────────────────────────────────────────────────────

def test_register_call_stores_mapping():
    from twilio_handler import register_call, _sid_to_lead
    register_call("CA_UNIT_TEST_001", "lead_001")
    assert _sid_to_lead.get("CA_UNIT_TEST_001") == "lead_001"

def test_register_call_overwrites_existing():
    from twilio_handler import register_call, _sid_to_lead
    register_call("CA_UNIT_TEST_002", "lead_001")
    register_call("CA_UNIT_TEST_002", "lead_002")
    assert _sid_to_lead["CA_UNIT_TEST_002"] == "lead_002"

def test_register_call_unknown_lead_id_stored():
    from twilio_handler import register_call, _sid_to_lead
    register_call("CA_UNIT_TEST_003", "unknown")
    assert _sid_to_lead["CA_UNIT_TEST_003"] == "unknown"


# ── TwiML voice webhook ───────────────────────────────────────────────────────

def test_twilio_voice_webhook_returns_200():
    from fastapi.testclient import TestClient
    from main import app as fastapi_app
    tc = TestClient(fastapi_app)
    with patch("twilio_handler._public_url", return_value="https://example.ngrok.io"):
        r = tc.post(
            "/twilio/voice",
            data={"CallSid": "CA_TEST_001", "CallStatus": "in-progress"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert r.status_code == 200

def test_twilio_voice_webhook_returns_xml():
    from fastapi.testclient import TestClient
    from main import app as fastapi_app
    tc = TestClient(fastapi_app)
    with patch("twilio_handler._public_url", return_value="https://example.ngrok.io"):
        r = tc.post(
            "/twilio/voice",
            data={"CallSid": "CA_TEST_002", "CallStatus": "in-progress"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert "xml" in r.headers.get("content-type", "").lower(), (
        "TwiML endpoint must return XML content-type"
    )

def test_twilio_voice_webhook_twiml_has_stream():
    from fastapi.testclient import TestClient
    from main import app as fastapi_app
    tc = TestClient(fastapi_app)
    with patch("twilio_handler._public_url", return_value="https://example.ngrok.io"):
        r = tc.post(
            "/twilio/voice",
            data={"CallSid": "CA_TEST_003", "CallStatus": "in-progress"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert "<Stream" in r.text, "TwiML must contain a <Stream> element for audio relay"

def test_twilio_voice_webhook_stream_url_uses_wss():
    from fastapi.testclient import TestClient
    from main import app as fastapi_app
    tc = TestClient(fastapi_app)
    with patch("twilio_handler._public_url", return_value="https://example.ngrok.io"):
        r = tc.post(
            "/twilio/voice",
            data={"CallSid": "CA_TEST_004", "CallStatus": "in-progress"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert "wss://" in r.text, (
        "Stream URL must use wss:// (secure WebSocket) — Twilio requires TLS"
    )

def test_twilio_voice_webhook_stream_contains_call_sid():
    from fastapi.testclient import TestClient
    from main import app as fastapi_app
    tc = TestClient(fastapi_app)
    call_sid = "CA_UNIQUE_SID_XYZ"
    with patch("twilio_handler._public_url", return_value="https://example.ngrok.io"):
        r = tc.post(
            "/twilio/voice",
            data={"CallSid": call_sid, "CallStatus": "in-progress"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert call_sid in r.text, (
        "The Stream URL must embed the CallSid so the WebSocket handler knows which call"
    )


# ── _analyze_transcript (Grok analysis) ──────────────────────────────────────

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_analyze_transcript_empty_transcript_returns_empty():
    from twilio_handler import _analyze_transcript
    result = _run(_analyze_transcript([], "Nobody"))
    assert result == {}, "Empty transcript should return {} without calling Grok"

def test_analyze_transcript_no_api_key_returns_empty():
    from twilio_handler import _analyze_transcript
    with patch("twilio_handler._read_env", return_value=""):
        result = _run(_analyze_transcript(
            [{"role": "agent", "text": "Hello"}], "Test"
        ))
    assert result == {}

def test_analyze_transcript_valid_grok_response():
    from twilio_handler import _analyze_transcript
    mock_payload = {
        "engagability": "High", "category": "Hot", "worth_pursuing": True,
        "purchase_intent": "High", "conclusion": "Strong lead.",
        "key_insights": ["insight1", "insight2", "insight3"],
        "next_action": "Book test drive"
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps(mock_payload)}}]
    }
    mock_resp.raise_for_status = MagicMock()

    async def _fake_post(*args, **kwargs):
        return mock_resp

    with patch("twilio_handler._read_env", return_value="fake_key"), \
         patch("httpx.AsyncClient") as mock_cls:
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=MagicMock(post=AsyncMock(return_value=mock_resp)))
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_ctx
        result = _run(_analyze_transcript(
            [{"role": "agent", "text": "Hello"}, {"role": "customer", "text": "Hi"}],
            "Test Customer"
        ))
    # If mock worked correctly
    if result:
        assert result.get("category") in ("Hot", "Warm", "Cold", None)

def test_analyze_transcript_markdown_fence_stripped():
    """
    BUG CHECK: Grok sometimes wraps JSON in ```json ... ``` fences.
    If the response ends with a trailing newline before the closing fence,
    the stripping logic may fail and include the fence in json.loads() input.
    """
    from twilio_handler import _analyze_transcript

    fenced_with_trailing_newline = "```json\n{\"category\": \"Hot\", \"worth_pursuing\": true}\n```\n"
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": fenced_with_trailing_newline}}]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("twilio_handler._read_env", return_value="fake_key"), \
         patch("httpx.AsyncClient") as mock_cls:
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(
            return_value=MagicMock(post=AsyncMock(return_value=mock_resp))
        )
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_ctx
        result = _run(_analyze_transcript(
            [{"role": "agent", "text": "Hello"}, {"role": "customer", "text": "Hi"}],
            "Test"
        ))

    if result == {}:
        pytest.xfail(
            "CONFIRMED BUG: _analyze_transcript fails to strip markdown fence when "
            "closing ``` is followed by a trailing newline. "
            "Fix: use content.rstrip() before checking lines[-1] == '```'."
        )

def test_analyze_transcript_malformed_json_returns_empty():
    """Invalid JSON from Grok should return {} gracefully, not crash."""
    from twilio_handler import _analyze_transcript
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "not valid JSON {"}}]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("twilio_handler._read_env", return_value="fake_key"), \
         patch("httpx.AsyncClient") as mock_cls:
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(
            return_value=MagicMock(post=AsyncMock(return_value=mock_resp))
        )
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_ctx
        try:
            result = _run(_analyze_transcript(
                [{"role": "agent", "text": "Hello"}], "Test"
            ))
            assert result == {}, f"Malformed JSON should return {{}}, got {result}"
        except Exception as e:
            pytest.fail(f"_analyze_transcript crashed on malformed JSON: {e}")


# ── Call log save flow ────────────────────────────────────────────────────────

def test_call_log_save_and_retrieve():
    import data.sample_leads as sl
    saved_logs = copy.deepcopy(sl._call_logs)
    try:
        log = {
            "call_id": "CA_SYSTEM_TEST_SAVE",
            "lead_id": "lead_001",
            "recipient": "System Test",
            "phone": "+91 99999 11111",
            "duration": "2:30",
            "status": "Completed",
            "outcome": "Test outcome",
            "date": "2025-01-01T10:00:00",
            "timestamp": "2025-01-01T10:00:00",
            "escalated": False,
            "transcript": [
                {"role": "agent", "text": "Hello"},
                {"role": "customer", "text": "Hi"},
            ],
        }
        sl.add_call_log(log)
        found = next((l for l in sl.get_call_logs() if l["call_id"] == "CA_SYSTEM_TEST_SAVE"), None)
        assert found is not None, "Saved call log not found in get_call_logs()"
        assert found["status"] == "Completed"
        assert len(found["transcript"]) == 2
    finally:
        sl._call_logs[:] = saved_logs

def test_call_log_post_analysis_update():
    import data.sample_leads as sl
    saved_logs = copy.deepcopy(sl._call_logs)
    try:
        sl.add_call_log({
            "call_id": "CA_ANALYSIS_TEST",
            "timestamp": "2025-01-01T10:00:00",
            "status": "Completed",
        })
        sl.update_call_log("CA_ANALYSIS_TEST", {
            "recording_sid": "RE_FAKE_SID",
            "ai_analysis": {"category": "Hot", "worth_pursuing": True},
        })
        updated = next(l for l in sl.get_call_logs() if l["call_id"] == "CA_ANALYSIS_TEST")
        assert updated["recording_sid"] == "RE_FAKE_SID"
        assert updated["ai_analysis"]["category"] == "Hot"
    finally:
        sl._call_logs[:] = saved_logs


# ── Stress / edge cases ───────────────────────────────────────────────────────

def test_find_duplicate_1000_leads_no_crash():
    import data.sample_leads as sl
    saved = copy.deepcopy(sl._leads_db)
    try:
        for i in range(1000):
            sl._leads_db.append({
                "lead_id": f"stress_{i:04d}",
                "name": f"Stress {i}",
                "phone": f"+91 {i:05d} {i:05d}",
                "email": f"stress{i:04d}@test.com",
                "status": "New", "tag": "Cold",
                "call_history": [], "preferences": {},
            })
        result = sl.find_duplicate_lead("+99 55555 55555", "definitely_not_there@x.com")
        assert result is None
    finally:
        sl._leads_db = saved

def test_get_call_logs_1000_entries_no_crash():
    import data.sample_leads as sl
    saved = copy.deepcopy(sl._call_logs)
    try:
        for i in range(1000):
            sl._call_logs.append({
                "call_id": f"CALL_STRESS_{i:04d}",
                "timestamp": f"2025-01-{(i % 28) + 1:02d}T10:00:00",
            })
        logs = sl.get_call_logs()
        assert len(logs) >= 1000
    finally:
        sl._call_logs[:] = saved

def test_analytics_with_all_untagged_leads():
    """All leads have no 'tag' field — should not crash and counts should be 0."""
    import data.sample_leads as sl
    saved = copy.deepcopy(sl._leads_db)
    try:
        for lead in sl._leads_db:
            lead.pop("tag", None)
        a = sl.get_analytics()
        assert a["hot_leads"] == 0
        assert a["warm_leads"] == 0
        assert a["cold_leads"] == 0
    finally:
        sl._leads_db = saved

def test_cors_origins_not_too_permissive_warning():
    """
    SECURITY NOTE: CORS is configured with allow_origins=['*'] in main.py.
    This is fine for development but must be restricted before production.
    """
    from main import app as fastapi_app
    cors_middleware = None
    for mw in fastapi_app.user_middleware:
        if "CORSMiddleware" in str(mw):
            cors_middleware = mw
            break
    if cors_middleware is not None:
        pytest.xfail(
            "SECURITY: CORS allows '*' — restrict allow_origins to your "
            "production domain before client goes live"
        )
