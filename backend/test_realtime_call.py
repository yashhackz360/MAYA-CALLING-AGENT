"""
Test Script — Real-Time Calling Feature
Tests the full flow: submit enquiry → CRM WS broadcast → call initiation → streaming WS
"""
import asyncio
import json
import sys
import httpx

API_BASE = "http://localhost:8000"

async def test_full_flow():
    print("=" * 60)
    print("  REAL-TIME CALLING FEATURE TEST")
    print("=" * 60)
    
    results = {"passed": 0, "failed": 0}
    
    def check(name, condition, detail=""):
        if condition:
            results["passed"] += 1
            print(f"  ✅ {name}")
        else:
            results["failed"] += 1
            print(f"  ❌ {name} — {detail}")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        # ── Test 1: Health check ──
        print("\n─── Test 1: Backend Health ───")
        try:
            r = await client.get(f"{API_BASE}/")
            check("Backend is running", r.status_code == 200, f"status={r.status_code}")
        except Exception as e:
            check("Backend is running", False, str(e))
            print("\n⚠️  Backend not running. Start it with: python main.py")
            return
        
        # ── Test 2: Voice config ──
        print("\n─── Test 2: Voice Config ───")
        r = await client.get(f"{API_BASE}/api/voice/config")
        cfg = r.json()
        check("Voice is 'ara' (Indian-friendly)", cfg.get("voice") == "ara", f"voice={cfg.get('voice')}")
        check("Model is 'grok-3-fast'", cfg.get("model") == "grok-3-fast", f"model={cfg.get('model')}")
        check("xAI API available", cfg.get("available") == True, f"available={cfg.get('available')}")
        
        # ── Test 3: Submit a new lead (simulates enquiry form) ──
        print("\n─── Test 3: Submit New Lead ───")
        test_lead = {
            "name": "Test User Realtime",
            "phone": "+91 9876543210",
            "email": "test.realtime@example.com",
            "source": "Automated Test",
            "contact_consent": True,
            "preferences": {
                "vehicle_model": "Škoda Kushaq",
                "enquiry_type": "Test Drive",
                "location": "Bangalore",
                "budget": "₹15–20 Lakhs"
            }
        }
        r = await client.post(f"{API_BASE}/api/leads", json=test_lead)
        check("Lead submitted successfully", r.status_code == 200, f"status={r.status_code}")
        lead_data = r.json()
        lead_id = lead_data.get("lead_id", "")
        check("Lead ID assigned", bool(lead_id), f"lead_id={lead_id}")
        print(f"    Lead ID: {lead_id}")
        
        # ── Test 4: Initiate call ──
        print("\n─── Test 4: Initiate Call ───")
        r = await client.post(f"{API_BASE}/api/calls/initiate", json={"lead_id": lead_id})
        check("Call initiated", r.status_code == 200, f"status={r.status_code}")
        call_data = r.json()
        call_id = call_data.get("call_id", "")
        opening = call_data.get("opening_message", "")
        check("Call ID assigned", bool(call_id), f"call_id={call_id}")
        check("Opening message present", bool(opening), "empty")
        check("Opening says 'Hello'", "Hello" in opening, f"got: {opening[:60]}")
        check("Opening says 'Škoda'", "Škoda" in opening, f"got: {opening[:60]}")
        check("No 'Am I speaking' in opening", "Am I speaking" not in opening, "Still contains identity question!")
        print(f"    Opening: \"{opening}\"")
        
        # ── Test 5: Process a turn (customer says yes) ──
        print("\n─── Test 5: Process Turn — Name Confirm ───")
        r = await client.post(f"{API_BASE}/api/calls/turn", json={
            "call_id": call_id, "user_input": "Yes, speaking"
        })
        check("Turn processed", r.status_code == 200, f"status={r.status_code}")
        turn1 = r.json()
        agent1 = turn1.get("agent_text", "")
        check("Agent responded", bool(agent1), "empty response")
        check("Mentions enquiry/records", "enquiry" in agent1.lower() or "records" in agent1.lower(), f"got: {agent1[:80]}")
        check("No 'Do you have a couple of minutes'", "couple of minutes" not in agent1, "Still asks for availability!")
        print(f"    Agent: \"{agent1}\"")
        
        # ── Test 6: Process a turn (customer interested) ──
        print("\n─── Test 6: Process Turn — Discovery ───")
        r = await client.post(f"{API_BASE}/api/calls/turn", json={
            "call_id": call_id, "user_input": "Yes that is correct, I am interested in the Kushaq"
        })
        turn2 = r.json()
        agent2 = turn2.get("agent_text", "")
        check("Discovery response", bool(agent2), "empty response")
        check("Response is concise (<100 chars)", len(agent2) < 100, f"length={len(agent2)}")
        print(f"    Agent: \"{agent2}\"")
        
        # ── Test 7: End call — check fixed goodbye ──
        print("\n─── Test 7: Natural Call Ending ───")
        r = await client.post(f"{API_BASE}/api/calls/turn", json={
            "call_id": call_id, "user_input": "Okay, that's all, thank you"
        })
        turn_end = r.json()
        agent_end = turn_end.get("agent_text", "")
        check("Ending response present", bool(agent_end), "empty")
        check("Contains 'Thank you for calling Škoda'",
              "Thank you for calling Škoda" in agent_end,
              f"got: {agent_end[:80]}")
        check("Contains 'Have a good day'",
              "Have a good day" in agent_end,
              f"got: {agent_end[:80]}")
        print(f"    Agent: \"{agent_end}\"")
        
        # ── Test 8: CRM WebSocket broadcast ──
        print("\n─── Test 8: CRM WebSocket Broadcast ───")
        import websockets
        try:
            ws_url = API_BASE.replace("http", "ws") + "/ws/crm"
            async with websockets.connect(ws_url) as ws:
                # Submit another lead while connected
                test_lead2 = {**test_lead, "name": "WS Test Lead", "email": "ws@test.com"}
                r = await client.post(f"{API_BASE}/api/leads", json=test_lead2)
                
                # Wait for broadcast (with timeout)
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    data = json.loads(msg)
                    check("CRM WS received new_lead event", data.get("type") == "new_lead", f"type={data.get('type')}")
                    check("Broadcast contains lead name", "WS Test Lead" in str(data), "name missing")
                except asyncio.TimeoutError:
                    check("CRM WS received new_lead event", False, "Timeout — no broadcast received")
        except Exception as e:
            check("CRM WebSocket connection", False, str(e))
        
        # ── Test 9: Streaming WS endpoint exists ──
        print("\n─── Test 9: Streaming WebSocket ───")
        try:
            # Initiate a fresh call for streaming test
            r2 = await client.post(f"{API_BASE}/api/calls/initiate", json={"lead_id": lead_id})
            if r2.status_code == 200:
                cid2 = r2.json().get("call_id", "")
                ws_url2 = API_BASE.replace("http", "ws") + f"/ws/call-stream/{cid2}"
                async with websockets.connect(ws_url2) as ws2:
                    msg = await asyncio.wait_for(ws2.recv(), timeout=5.0)
                    data = json.loads(msg)
                    check("Streaming WS connects", data.get("type") == "connected", f"type={data.get('type')}")
                    check("Streaming WS reports streaming=True", data.get("streaming") == True, f"streaming={data.get('streaming')}")
            else:
                check("Streaming WS test", False, f"Call init failed: {r2.status_code}")
        except Exception as e:
            check("Streaming WebSocket", False, str(e))
    
    # ── Summary ──
    total = results["passed"] + results["failed"]
    print("\n" + "=" * 60)
    print(f"  RESULTS: {results['passed']}/{total} passed, {results['failed']} failed")
    if results["failed"] == 0:
        print("  🎉 ALL TESTS PASSED!")
    else:
        print("  ⚠️  Some tests failed — check output above")
    print("=" * 60)
    
    return results["failed"] == 0

if __name__ == "__main__":
    ok = asyncio.run(test_full_flow())
    sys.exit(0 if ok else 1)
