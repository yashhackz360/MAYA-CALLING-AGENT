from agent.conversation import get_opening_message
from agent.llm_client import humanize_for_speech
from data.sample_leads import get_all_leads, create_lead
from call_manager.manager import initiate_call

print("✅ All imports OK")

leads = get_all_leads()
lead = leads[0]
print(f"First lead: {lead['name']}")

msg = get_opening_message(lead)
print(f"Opening message: {msg}")

processed = humanize_for_speech("Škoda Kushaq TSI ₹1.5Cr DSG EMI approved")
print(f"Humanized: {processed}")

new_lead = create_lead({
    "name": "Test User",
    "phone": "+91 9999999999",
    "email": "test@example.com",
    "source": "Website",
    "preferences": {"location": "Bangalore", "vehicle_model": "Škoda Kushaq", "enquiry_type": "New Purchase"}
})
print(f"New lead tag: {new_lead['tag']}, urgency: {new_lead['urgency']}, campaign: {new_lead['campaign']}")
print("✅ All checks passed!")
