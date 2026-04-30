"""
Full conversation test — simulates a complete call between Maya and a customer.
Tests: API connectivity, LLM response quality, state transitions, profile extraction.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

from agent.llm_client import init_llm_backend
from agent.conversation import CallSession, get_opening_message, process_customer_input

# ─── Test Lead (simulates database entry) ────────────────────────────────────

TEST_LEAD = {
    "lead_id":     "LEAD-001",
    "name":        "Ananya Sharma",
    "phone":       "9876543210",
    "source":      "Website Enquiry",
    "preferences": {
        "vehicle_model": "Skoda Kushaq",
        "enquiry_type":  "New Purchase",
    }
}

# ─── Simulated customer responses ────────────────────────────────────────────

CUSTOMER_TURNS = [
    "Yes, this is Ananya speaking",
    "Yes sure, go ahead",
    "I'm looking at the Kushaq, the top variant",
    "Around 18 to 20 lakhs",
    "I prefer automatic, the DSG one",
    "I'm based in Pune",
    "What are the latest offers on the Kushaq right now?",
    "Can you arrange a test drive for me this weekend?",
    "Okay thanks, that sounds good. Bye!",
]


async def run_test():
    print("=" * 70)
    print("  FULL CONVERSATION TEST")
    print("=" * 70)

    # Init backend
    init_llm_backend()
    print()

    # Create session
    session = CallSession(lead=TEST_LEAD)

    # Opening message
    opening = get_opening_message(TEST_LEAD)
    session.add_turn("agent", opening)
    print(f"  Maya:     {opening}")
    print()

    # Run each customer turn
    for i, customer_input in enumerate(CUSTOMER_TURNS):
        print(f"  Customer: {customer_input}")

        result = await process_customer_input(session, customer_input)
        agent_response = result.get("agent_text", "(no response)")
        state = result.get("state", "?")
        ended = result.get("call_ended", False)

        print(f"  Maya:     {agent_response}")
        print(f"            [state={state}, ended={ended}]")
        print()

        if ended:
            print("  --- CALL ENDED ---")
            break

    # Print extracted profile
    prefs = session.lead.get("preferences", {})
    print()
    print("=" * 70)
    print("  EXTRACTED CUSTOMER PROFILE")
    print("=" * 70)
    for k, v in prefs.items():
        print(f"    {k:20s}: {v}")

    print()
    print(f"  Total turns: {session.turn_count}")
    print(f"  Outcome:     {session.outcome or 'In Progress'}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_test())
