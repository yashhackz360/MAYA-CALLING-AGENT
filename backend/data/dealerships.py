"""
dealerships.py — Dealership Intelligence Layer · MantaRay AI · Škoda India

Provides city-specific dealership data, live-like inventory, and helper
functions that build rich context strings for injection into the ElevenLabs
AI voice agent system prompt.

Usage:
    from data.dealerships import get_city_context, get_inventory_context, get_dealer_for_city

Structure:
    DEALERSHIPS  — master dict keyed by normalised city slug
    INVENTORY    — per-model, per-variant stock data
    Helper fns   — context builders used in twilio_handler.py
"""

from __future__ import annotations
from typing import Optional

# ─── Master Dealership Database ───────────────────────────────────────────────
# 10 major Indian cities, 2–4 dealerships each
# Fields: id, name, address, area, phone, manager, rating, open_hours,
#         services (list), specialties (list)

DEALERSHIPS: dict[str, list[dict]] = {

    # ── Bangalore ──────────────────────────────────────────────────────────────
    "bangalore": [
        {
            "id": "BLR-001",
            "name": "Škoda Whitefield",
            "area": "Whitefield",
            "address": "Plot 14, ITPL Main Road, Whitefield, Bengaluru – 560066",
            "phone": "080-4567-8901",
            "manager": "Mr. Suresh Nair",
            "rating": 4.8,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance", "Accessories"],
            "specialties": ["Kushaq", "Slavia", "Kodiaq"],
            "wait_time_days": 7,
            "distance_from_center_km": 22,
        },
        {
            "id": "BLR-002",
            "name": "Škoda Indiranagar",
            "area": "Indiranagar",
            "address": "No. 5, 100 Feet Road, Indiranagar, Bengaluru – 560038",
            "phone": "080-2534-7890",
            "manager": "Ms. Kavitha Rao",
            "rating": 4.6,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 4 PM",
            "services": ["Sales", "Test Drive", "Finance", "Pre-owned"],
            "specialties": ["Slavia", "Superb"],
            "wait_time_days": 5,
            "distance_from_center_km": 8,
        },
        {
            "id": "BLR-003",
            "name": "Škoda Electronic City",
            "area": "Electronic City",
            "address": "Phase 1, Hosur Road, Electronic City, Bengaluru – 560100",
            "phone": "080-6789-0123",
            "manager": "Mr. Rajiv Menon",
            "rating": 4.5,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 10,
            "distance_from_center_km": 30,
        },
    ],

    # ── Mumbai ─────────────────────────────────────────────────────────────────
    "mumbai": [
        {
            "id": "MUM-001",
            "name": "Škoda Andheri",
            "area": "Andheri West",
            "address": "S.V. Road, Andheri West, Mumbai – 400058",
            "phone": "022-6789-4321",
            "manager": "Mr. Nikhil Patil",
            "rating": 4.7,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance", "Leasing"],
            "specialties": ["Slavia", "Superb", "Kodiaq"],
            "wait_time_days": 14,
            "distance_from_center_km": 13,
        },
        {
            "id": "MUM-002",
            "name": "Škoda Worli",
            "area": "Worli",
            "address": "Dr. Annie Besant Road, Worli, Mumbai – 400018",
            "phone": "022-2432-8765",
            "manager": "Ms. Preethi Joshi",
            "rating": 4.9,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "VIP Delivery"],
            "specialties": ["Superb", "Kodiaq", "Enyaq"],
            "wait_time_days": 21,
            "distance_from_center_km": 5,
        },
        {
            "id": "MUM-003",
            "name": "Škoda Thane",
            "area": "Thane",
            "address": "Ghodbunder Road, Thane West – 400610",
            "phone": "022-2589-6543",
            "manager": "Mr. Amit Deshmukh",
            "rating": 4.4,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 8,
            "distance_from_center_km": 25,
        },
    ],

    # ── Delhi NCR ──────────────────────────────────────────────────────────────
    "delhi": [
        {
            "id": "DEL-001",
            "name": "Škoda Connaught Place",
            "area": "Connaught Place",
            "address": "A-Block, Connaught Place, New Delhi – 110001",
            "phone": "011-4321-8765",
            "manager": "Mr. Rohit Sharma",
            "rating": 4.8,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 6 PM",
            "services": ["Sales", "Test Drive", "Finance", "Insurance", "VIP Delivery"],
            "specialties": ["Superb", "Kodiaq", "Slavia"],
            "wait_time_days": 10,
            "distance_from_center_km": 0,
        },
        {
            "id": "DEL-002",
            "name": "Škoda Gurugram",
            "area": "Gurugram",
            "address": "DLF Cyber City, Sector 24, Gurugram – 122022",
            "phone": "0124-4567-8900",
            "manager": "Ms. Sakshi Arora",
            "rating": 4.7,
            "open_hours": "Mon–Sat 9 AM – 8 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Corporate Leasing"],
            "specialties": ["Kushaq", "Kodiaq", "Superb"],
            "wait_time_days": 7,
            "distance_from_center_km": 30,
        },
        {
            "id": "DEL-003",
            "name": "Škoda Noida",
            "area": "Noida",
            "address": "Sector 18, Atta Market, Noida – 201301",
            "phone": "0120-4321-5678",
            "manager": "Mr. Gaurav Kapoor",
            "rating": 4.5,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 5,
            "distance_from_center_km": 18,
        },
    ],

    # ── Hyderabad ──────────────────────────────────────────────────────────────
    "hyderabad": [
        {
            "id": "HYD-001",
            "name": "Škoda Jubilee Hills",
            "area": "Jubilee Hills",
            "address": "Road No. 36, Jubilee Hills, Hyderabad – 500033",
            "phone": "040-6789-1234",
            "manager": "Mr. Siddharth Reddy",
            "rating": 4.9,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance", "VIP Delivery"],
            "specialties": ["Kodiaq", "Superb", "Kushaq"],
            "wait_time_days": 7,
            "distance_from_center_km": 8,
        },
        {
            "id": "HYD-002",
            "name": "Škoda HITEC City",
            "area": "HITEC City",
            "address": "Cyber Towers, HITEC City, Hyderabad – 500081",
            "phone": "040-2345-6789",
            "manager": "Ms. Divya Krishnan",
            "rating": 4.6,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 4 PM",
            "services": ["Sales", "Test Drive", "Finance", "Pre-owned"],
            "specialties": ["Kushaq", "Slavia", "Kodiaq"],
            "wait_time_days": 12,
            "distance_from_center_km": 15,
        },
    ],

    # ── Pune ───────────────────────────────────────────────────────────────────
    "pune": [
        {
            "id": "PUN-001",
            "name": "Škoda Baner",
            "area": "Baner",
            "address": "Baner Road, Near Balewadi Stadium, Pune – 411045",
            "phone": "020-6789-2345",
            "manager": "Mr. Kiran Joshi",
            "rating": 4.7,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Kushaq", "Slavia", "Kodiaq"],
            "wait_time_days": 6,
            "distance_from_center_km": 12,
        },
        {
            "id": "PUN-002",
            "name": "Škoda Viman Nagar",
            "area": "Viman Nagar",
            "address": "Vadgaon Sheri Road, Viman Nagar, Pune – 411014",
            "phone": "020-2671-3456",
            "manager": "Ms. Nisha Kulkarni",
            "rating": 4.5,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 4,
            "distance_from_center_km": 7,
        },
    ],

    # ── Chennai ────────────────────────────────────────────────────────────────
    "chennai": [
        {
            "id": "CHN-001",
            "name": "Škoda Anna Nagar",
            "area": "Anna Nagar",
            "address": "2nd Avenue, Anna Nagar, Chennai – 600040",
            "phone": "044-4567-2345",
            "manager": "Mr. Vijay Kumar",
            "rating": 4.7,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Kushaq", "Slavia", "Superb"],
            "wait_time_days": 8,
            "distance_from_center_km": 9,
        },
        {
            "id": "CHN-002",
            "name": "Škoda OMR",
            "area": "OMR",
            "address": "Old Mahabalipuram Road, Perungudi, Chennai – 600096",
            "phone": "044-6789-0001",
            "manager": "Ms. Lakshmi Nair",
            "rating": 4.6,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 5,
            "distance_from_center_km": 18,
        },
    ],

    # ── Kolkata ────────────────────────────────────────────────────────────────
    "kolkata": [
        {
            "id": "KOL-001",
            "name": "Škoda Park Street",
            "area": "Park Street",
            "address": "17 Park Street, Kolkata – 700016",
            "phone": "033-4567-8901",
            "manager": "Mr. Debasis Bose",
            "rating": 4.6,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Slavia", "Kushaq", "Superb"],
            "wait_time_days": 9,
            "distance_from_center_km": 3,
        },
        {
            "id": "KOL-002",
            "name": "Škoda New Town",
            "area": "New Town",
            "address": "Action Area II, New Town, Rajarhat, Kolkata – 700156",
            "phone": "033-2345-6789",
            "manager": "Ms. Priya Ghosh",
            "rating": 4.4,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 6,
            "distance_from_center_km": 20,
        },
    ],

    # ── Ahmedabad ──────────────────────────────────────────────────────────────
    "ahmedabad": [
        {
            "id": "AMD-001",
            "name": "Škoda SG Highway",
            "area": "SG Highway",
            "address": "Sola Overbridge, SG Highway, Ahmedabad – 380054",
            "phone": "079-6789-3456",
            "manager": "Mr. Hardik Patel",
            "rating": 4.7,
            "open_hours": "Mon–Sat 9 AM – 7:30 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Kushaq", "Slavia", "Kodiaq"],
            "wait_time_days": 7,
            "distance_from_center_km": 14,
        },
        {
            "id": "AMD-002",
            "name": "Škoda Prahlad Nagar",
            "area": "Prahlad Nagar",
            "address": "100 Feet Road, Prahlad Nagar, Ahmedabad – 380015",
            "phone": "079-2672-4567",
            "manager": "Ms. Rutvi Shah",
            "rating": 4.5,
            "open_hours": "Mon–Sat 9 AM – 7 PM",
            "services": ["Sales", "Test Drive", "Finance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 10,
            "distance_from_center_km": 9,
        },
    ],

    # ── Jaipur ─────────────────────────────────────────────────────────────────
    "jaipur": [
        {
            "id": "JAI-001",
            "name": "Škoda Tonk Road",
            "area": "Tonk Road",
            "address": "Near Durgapura Railway Station, Tonk Road, Jaipur – 302018",
            "phone": "0141-4567-8901",
            "manager": "Mr. Rajesh Singhvi",
            "rating": 4.6,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 4 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Kushaq", "Slavia"],
            "wait_time_days": 8,
            "distance_from_center_km": 7,
        },
    ],

    # ── Kochi ──────────────────────────────────────────────────────────────────
    "kochi": [
        {
            "id": "KOC-001",
            "name": "Škoda Edapally",
            "area": "Edapally",
            "address": "Edapally Junction, NH-66, Kochi – 682024",
            "phone": "0484-4567-2345",
            "manager": "Mr. George Thomas",
            "rating": 4.8,
            "open_hours": "Mon–Sat 9 AM – 7 PM, Sun 10 AM – 5 PM",
            "services": ["Sales", "Service", "Test Drive", "Finance", "Insurance"],
            "specialties": ["Kushaq", "Slavia", "Kodiaq"],
            "wait_time_days": 5,
            "distance_from_center_km": 10,
        },
    ],
}

# ─── City Alias Map ───────────────────────────────────────────────────────────
# Normalises common user inputs to the correct key in DEALERSHIPS

_CITY_ALIASES: dict[str, str] = {
    # Bangalore variants
    "bangalore":    "bangalore",
    "bengaluru":    "bangalore",
    "blr":          "bangalore",
    "whitefield":   "bangalore",
    "indiranagar":  "bangalore",
    "electronic city": "bangalore",
    # Mumbai variants
    "mumbai":       "mumbai",
    "bombay":       "mumbai",
    "mum":          "mumbai",
    "thane":        "mumbai",
    "worli":        "mumbai",
    "andheri":      "mumbai",
    # Delhi variants
    "delhi":        "delhi",
    "new delhi":    "delhi",
    "delhi ncr":    "delhi",
    "ncr":          "delhi",
    "gurugram":     "delhi",
    "gurgaon":      "delhi",
    "noida":        "delhi",
    # Hyderabad variants
    "hyderabad":    "hyderabad",
    "hyd":          "hyderabad",
    "hitec city":   "hyderabad",
    "jubilee hills": "hyderabad",
    "secunderabad": "hyderabad",
    # Pune variants
    "pune":         "pune",
    "pun":          "pune",
    "baner":        "pune",
    "viman nagar":  "pune",
    # Chennai variants
    "chennai":      "chennai",
    "madras":       "chennai",
    "omr":          "chennai",
    # Kolkata variants
    "kolkata":      "kolkata",
    "calcutta":     "kolkata",
    "new town":     "kolkata",
    # Ahmedabad variants
    "ahmedabad":    "ahmedabad",
    "amdavad":      "ahmedabad",
    "sg highway":   "ahmedabad",
    # Jaipur variants
    "jaipur":       "jaipur",
    "pink city":    "jaipur",
    # Kochi variants
    "kochi":        "kochi",
    "cochin":       "kochi",
    "ernakulam":    "kochi",
}

# ─── Inventory Database ───────────────────────────────────────────────────────
# Realistic, model-variant-level inventory data for all current Škoda India models
# stock_status: "Available" | "Limited" | "On Request" | "Waitlisted"

INVENTORY: dict[str, dict] = {

    "Škoda Kushaq": {
        "tagline": "India's own Škoda — feature-packed compact SUV",
        "price_range": "₹11.5 – 19.5 Lakhs",
        "category": "Compact SUV",
        "engine_options": ["1.0 TSI (115 PS, MPI)", "1.5 TSI (150 PS, DSG)"],
        "fuel": "Petrol",
        "variants": {
            "Active 1.0 TSI MT": {
                "price_ex_showroom": "₹11.49 Lakhs",
                "transmission": "Manual",
                "stock_status": "Available",
                "stock_count": 8,
                "delivery_weeks": 1,
                "colours": ["Candy White", "Carbon Steel Grey", "Tornado Red"],
                "highlights": ["17\" alloys", "8\" infotainment", "4 airbags", "6-speed MT"],
            },
            "Ambition 1.0 TSI MT": {
                "price_ex_showroom": "₹13.49 Lakhs",
                "transmission": "Manual",
                "stock_status": "Available",
                "stock_count": 6,
                "delivery_weeks": 1,
                "colours": ["Candy White", "Carbon Steel Grey", "Tornado Red", "Olive Gold"],
                "highlights": ["Wireless Android Auto/Apple CarPlay", "Ventilated seats", "cruise control"],
            },
            "Ambition 1.0 TSI AT": {
                "price_ex_showroom": "₹14.99 Lakhs",
                "transmission": "Automatic (6AT)",
                "stock_status": "Available",
                "stock_count": 4,
                "delivery_weeks": 2,
                "colours": ["Candy White", "Carbon Steel Grey", "Tornado Red"],
                "highlights": ["6AT auto gearbox", "Hill Hold", "Rear Parking Camera"],
            },
            "Style 1.5 TSI AT": {
                "price_ex_showroom": "₹17.49 Lakhs",
                "transmission": "Automatic (DSG)",
                "stock_status": "Limited",
                "stock_count": 2,
                "delivery_weeks": 3,
                "colours": ["Candy White", "Tornado Red", "Brilliant Silver", "Olive Gold"],
                "highlights": ["1.5 TSI 150 PS DSG", "Ventilated seats", "Sunroof", "KESSY", "6 airbags"],
            },
            "Monte Carlo 1.5 TSI DSG": {
                "price_ex_showroom": "₹19.49 Lakhs",
                "transmission": "Automatic (DSG)",
                "stock_status": "On Request",
                "stock_count": 0,
                "delivery_weeks": 6,
                "colours": ["Tornado Red", "Carbon Steel Grey"],
                "highlights": ["Sport body kit", "Black roof", "Monte Carlo badging", "19\" alloys (optional)"],
            },
        },
        "finance_offers": "EMI from ₹17,800/month on Ambition | 0% processing fee via Škoda Finance | SBI special rate 8.4%",
        "current_offers": "Exchange bonus ₹50,000 | Loyalty benefit ₹25,000 | Corporate discount ₹20,000",
        "warranty": "4 years / 1 lakh km | Roadside Assistance across India",
        "service_interval": "15,000 km or 12 months",
    },

    "Škoda Slavia": {
        "tagline": "The sportiest mid-size sedan in India",
        "price_range": "₹12.5 – 20.5 Lakhs",
        "category": "Mid-size Sedan",
        "engine_options": ["1.0 TSI (115 PS, 6MT)", "1.5 TSI (150 PS, DSG)"],
        "fuel": "Petrol",
        "variants": {
            "Active 1.0 TSI MT": {
                "price_ex_showroom": "₹12.49 Lakhs",
                "transmission": "Manual",
                "stock_status": "Available",
                "stock_count": 7,
                "delivery_weeks": 1,
                "colours": ["Candy White", "Carbon Steel Grey", "Tornado Red"],
                "highlights": ["16\" alloys", "8\" infotainment", "6 airbags", "rear disc brakes"],
            },
            "Ambition 1.0 TSI MT": {
                "price_ex_showroom": "₹14.49 Lakhs",
                "transmission": "Manual",
                "stock_status": "Available",
                "stock_count": 5,
                "delivery_weeks": 1,
                "colours": ["Candy White", "Carbon Steel Grey", "Tornado Red", "Brilliant Silver"],
                "highlights": ["Wireless CarPlay/Android Auto", "Sunroof", "cruise control"],
            },
            "Style 1.5 TSI DSG": {
                "price_ex_showroom": "₹17.99 Lakhs",
                "transmission": "Automatic (DSG)",
                "stock_status": "Available",
                "stock_count": 3,
                "delivery_weeks": 2,
                "colours": ["Candy White", "Tornado Red", "Brilliant Silver", "Spine Blue"],
                "highlights": ["1.5 TSI 150 PS DSG", "10.1\" touchscreen", "Virtual cockpit", "Sunroof", "6 airbags"],
            },
            "Monte Carlo 1.5 TSI DSG": {
                "price_ex_showroom": "₹20.49 Lakhs",
                "transmission": "Automatic (DSG)",
                "stock_status": "Limited",
                "stock_count": 1,
                "delivery_weeks": 4,
                "colours": ["Carbon Steel Grey", "Spine Blue"],
                "highlights": ["Sport kit", "Piano Black interior", "Red brake calipers", "Monte Carlo trim"],
            },
        },
        "finance_offers": "EMI from ₹19,500/month on Style | Special DSG EMI ₹24,200/month | HDFC Bank tie-up at 8.5%",
        "current_offers": "Exchange bonus ₹75,000 | Women's Drive special ₹10,000 off",
        "warranty": "4 years / 1 lakh km | 24×7 Roadside Assistance",
        "service_interval": "15,000 km or 12 months",
    },

    "Škoda Kodiaq": {
        "tagline": "The flagship full-size SUV — built for India, engineered for Europe",
        "price_range": "₹38 – 47 Lakhs",
        "category": "Full-size SUV",
        "engine_options": ["2.0 TSI (190 PS, DSG, 4×4)"],
        "fuel": "Petrol",
        "variants": {
            "Style 2.0 TSI DSG": {
                "price_ex_showroom": "₹38.49 Lakhs",
                "transmission": "Automatic (DSG 4×4)",
                "stock_status": "Limited",
                "stock_count": 2,
                "delivery_weeks": 4,
                "colours": ["Candy White", "Carbon Steel Grey", "Moon White"],
                "highlights": ["2.0 TSI 190 PS AWD DSG", "7-seater", "Panoramic sunroof", "Canton 12-speaker audio"],
            },
            "Sportline 2.0 TSI DSG": {
                "price_ex_showroom": "₹43.99 Lakhs",
                "transmission": "Automatic (DSG 4×4)",
                "stock_status": "On Request",
                "stock_count": 0,
                "delivery_weeks": 8,
                "colours": ["Steel Grey", "Graphite Grey"],
                "highlights": ["Sportline body kit", "21\" alloys", "Sport suspension", "DCC adaptive chassis"],
            },
            "Laurin & Klement 2.0 TSI DSG": {
                "price_ex_showroom": "₹46.99 Lakhs",
                "transmission": "Automatic (DSG 4×4)",
                "stock_status": "On Request",
                "stock_count": 0,
                "delivery_weeks": 10,
                "colours": ["Moon White", "Midnight Black"],
                "highlights": ["L&K premium trim", "Ventilated leather seats", "Ambient lighting", "Heads-up display"],
            },
        },
        "finance_offers": "EMI from ₹62,000/month | Corporate lease available | HDFC NRI special",
        "current_offers": "Complimentary 1st year service | Accessories worth ₹30,000 included",
        "warranty": "4 years / 1 lakh km | European-grade roadside assist",
        "service_interval": "15,000 km or 12 months",
    },

    "Škoda Superb": {
        "tagline": "The flagship executive sedan — India's most refined European car",
        "price_range": "₹35 – 40 Lakhs",
        "category": "Executive Sedan",
        "engine_options": ["2.0 TSI (190 PS, DSG)"],
        "fuel": "Petrol",
        "variants": {
            "Style 2.0 TSI DSG": {
                "price_ex_showroom": "₹34.99 Lakhs",
                "transmission": "Automatic (DSG FWD)",
                "stock_status": "Available",
                "stock_count": 3,
                "delivery_weeks": 3,
                "colours": ["Candy White", "Moon White", "Brilliant Silver"],
                "highlights": ["2.0 TSI 190 PS DSG", "10.1\" Amundsen infotainment", "Canton audio", "8 airbags"],
            },
            "Laurin & Klement 2.0 TSI DSG": {
                "price_ex_showroom": "₹39.99 Lakhs",
                "transmission": "Automatic (DSG FWD)",
                "stock_status": "Limited",
                "stock_count": 1,
                "delivery_weeks": 5,
                "colours": ["Quartz Grey", "Moon White"],
                "highlights": ["L&K premium leather", "Virtual cockpit", "Heads-up display", "Electrically adjustable massage seats"],
            },
        },
        "finance_offers": "EMI from ₹56,000/month | Corporate accounts special 8.0% rate",
        "current_offers": "Chauffeur experience trial | Executive gifting package ₹25,000",
        "warranty": "4 years / 1 lakh km",
        "service_interval": "15,000 km or 12 months",
    },

    "Škoda Enyaq": {
        "tagline": "Škoda's first all-electric SUV — premium range, zero compromise",
        "price_range": "₹60 – 70 Lakhs",
        "category": "Electric SUV",
        "engine_options": ["82 kWh battery (204 PS, single motor)"],
        "fuel": "Electric",
        "variants": {
            "Enyaq 60 iV": {
                "price_ex_showroom": "₹60.49 Lakhs",
                "transmission": "Automatic (Single Speed)",
                "stock_status": "On Request",
                "stock_count": 0,
                "delivery_weeks": 12,
                "colours": ["Phoenix Orange", "Moon White", "Graphite Grey"],
                "highlights": ["Range: 520 km WLTC", "100 kW DC fast charge", "13\" infotainment", "AR HUD"],
            },
            "Enyaq Coupe iV RS": {
                "price_ex_showroom": "₹69.99 Lakhs",
                "transmission": "Automatic (Dual Motor AWD)",
                "stock_status": "On Request",
                "stock_count": 0,
                "delivery_weeks": 16,
                "colours": ["Dark Graphite", "Moon White"],
                "highlights": ["299 PS AWD", "0-100 km/h in 6.5s", "Coupe roofline", "Canton audio"],
            },
        },
        "finance_offers": "EV tax benefit Section 80EEB | Green car loan 7.5% | Škoda EV leasing",
        "current_offers": "Free home charger installation | 5 years maintenance included",
        "warranty": "8 years / 1.6 lakh km battery warranty | 4 years vehicle warranty",
        "service_interval": "30,000 km or 24 months (electric)",
    },
}

# ─── Model Alias Map ──────────────────────────────────────────────────────────

_MODEL_ALIASES: dict[str, str] = {
    "kushaq":                "Škoda Kushaq",
    "skoda kushaq":          "Škoda Kushaq",
    "škoda kushaq":          "Škoda Kushaq",
    "slavia":                "Škoda Slavia",
    "skoda slavia":          "Škoda Slavia",
    "škoda slavia":          "Škoda Slavia",
    "kodiaq":                "Škoda Kodiaq",
    "skoda kodiaq":          "Škoda Kodiaq",
    "škoda kodiaq":          "Škoda Kodiaq",
    "superb":                "Škoda Superb",
    "skoda superb":          "Škoda Superb",
    "škoda superb":          "Škoda Superb",
    "enyaq":                 "Škoda Enyaq",
    "skoda enyaq":           "Škoda Enyaq",
    "škoda enyaq":           "Škoda Enyaq",
}


# ─── Helper Functions ─────────────────────────────────────────────────────────

def _normalise_city(city: str) -> str:
    """Return the canonical city key from any user input string."""
    if not city:
        return ""
    return _CITY_ALIASES.get(city.strip().lower(), "")


def _normalise_model(model: str) -> str:
    """Return the canonical inventory key from any user input string."""
    if not model:
        return ""
    return _MODEL_ALIASES.get(model.strip().lower(), "")


def get_dealers_for_city(city: str) -> list[dict]:
    """Return all dealerships for a given city string (fuzzy-matched)."""
    key = _normalise_city(city)
    return DEALERSHIPS.get(key, [])


def get_dealer_for_city(city: str, preferred_area: str = "") -> Optional[dict]:
    """
    Return the best matching dealership for the city.
    If preferred_area is given, prefer the dealership whose area matches.
    Falls back to the highest-rated dealership.
    """
    dealers = get_dealers_for_city(city)
    if not dealers:
        return None
    if preferred_area:
        area_lower = preferred_area.strip().lower()
        for d in dealers:
            if area_lower in d["area"].lower() or area_lower in d["address"].lower():
                return d
    # Sort by rating descending, return best
    return sorted(dealers, key=lambda d: d.get("rating", 0), reverse=True)[0]


def get_inventory_for_model(model: str) -> Optional[dict]:
    """Return inventory data for a given model name (fuzzy-matched)."""
    key = _normalise_model(model)
    return INVENTORY.get(key)


def get_variant_availability(model: str, variant_hint: str = "") -> list[dict]:
    """
    Return a list of variant availability summaries for a model.
    If variant_hint is given, filter to variants matching the hint.
    """
    inv = get_inventory_for_model(model)
    if not inv:
        return []
    results = []
    hint_lower = variant_hint.strip().lower() if variant_hint else ""
    for var_name, var_data in inv["variants"].items():
        if hint_lower and hint_lower not in var_name.lower():
            continue
        results.append({
            "variant":       var_name,
            "price":         var_data["price_ex_showroom"],
            "transmission":  var_data["transmission"],
            "status":        var_data["stock_status"],
            "stock_count":   var_data["stock_count"],
            "delivery_weeks": var_data["delivery_weeks"],
            "colours":       var_data["colours"],
            "highlights":    var_data["highlights"],
        })
    return results


# ─── AI Context Builders ──────────────────────────────────────────────────────
# These build compact, natural-language strings for injection into
# ElevenLabs dynamic variables. Kept under 300 chars each for prompt hygiene.

def get_city_context(city: str) -> str:
    """
    Returns a terse, conversational dealership line for the AI voice agent.
    Example: "We have 3 Škoda showrooms in Bangalore. The nearest to you is
    Škoda Whitefield in Whitefield — rated 4.8★. Call: 080-4567-8901."
    """
    dealers = get_dealers_for_city(city)
    if not dealers:
        return "We have Škoda dealerships across India — I can help you find the nearest one."
    best = sorted(dealers, key=lambda d: d.get("rating", 0), reverse=True)[0]
    count = len(dealers)
    return (
        f"We have {count} Škoda showroom{'s' if count > 1 else ''} in {city.title()}. "
        f"The top-rated one is {best['name']} in {best['area']} — rated {best['rating']}★. "
        f"Contact: {best['phone']}. Open: {best['open_hours']}."
    )


def get_inventory_context(model: str, variant: str = "", transmission: str = "") -> str:
    """
    Returns a terse inventory status string for the AI voice agent.
    Example: "Škoda Kushaq Style 1.5 TSI AT: Limited stock (2 units). Delivery in 3 weeks.
    Colours: Candy White, Tornado Red, Brilliant Silver. EMI from ₹..."
    """
    inv = get_inventory_for_model(model)
    if not inv:
        return f"Let me check availability for {model} — I'll have our team confirm the latest stock."

    canonical_model = _normalise_model(model)
    # Try to find the best matching variant
    best_var: Optional[tuple[str, dict]] = None
    variants = inv["variants"]

    if variant or transmission:
        v_lower = variant.strip().lower() if variant else ""
        t_lower = transmission.strip().lower() if transmission else ""
        for vname, vdata in variants.items():
            vname_lower = vname.lower()
            trans_lower = vdata.get("transmission", "").lower()
            v_match = v_lower in vname_lower if v_lower else True
            t_match = t_lower in trans_lower if t_lower else True
            if v_match and t_match:
                best_var = (vname, vdata)
                break

    if not best_var:
        # Default to best-stocked available variant
        for vname, vdata in variants.items():
            if vdata["stock_status"] == "Available":
                best_var = (vname, vdata)
                break
        if not best_var:
            vname, vdata = next(iter(variants.items()))
            best_var = (vname, vdata)

    vname, vdata = best_var
    status = vdata["stock_status"]
    colours_str = ", ".join(vdata["colours"][:3])
    delivery = vdata["delivery_weeks"]
    delivery_str = f"{delivery} week{'s' if delivery != 1 else ''}" if delivery > 0 else "immediate"

    stock_note = ""
    if status == "Available":
        stock_note = f"{vdata['stock_count']} unit(s) in stock — delivery {delivery_str}"
    elif status == "Limited":
        stock_note = f"only {vdata['stock_count']} unit(s) left — book quickly"
    elif status == "On Request":
        stock_note = f"built-to-order — delivery in {delivery_str}"
    else:
        stock_note = f"high demand — waitlist open"

    return (
        f"{canonical_model} {vname}: {stock_note}. "
        f"Price: {vdata['price_ex_showroom']} (ex-showroom). "
        f"Colours: {colours_str}. "
        f"{inv.get('finance_offers', '')[:120]}"
    )


def get_offers_context(model: str) -> str:
    """Returns current offers/finance string for AI to quote naturally."""
    inv = get_inventory_for_model(model)
    if not inv:
        return "We currently have exciting offers on all Škoda models — I'll share the details."
    return inv.get("current_offers", "") or "Ask about our exchange and loyalty bonuses today."


def get_dealer_appointment_context(city: str) -> str:
    """Returns a compact appointment-booking prompt for the AI."""
    dealer = get_dealer_for_city(city)
    if not dealer:
        return "I can arrange a test drive at your nearest Škoda dealership."
    wait = dealer.get("wait_time_days", 7)
    return (
        f"I can book you a test drive at {dealer['name']} in {dealer['area']}. "
        f"Typical appointment wait: {wait} day{'s' if wait != 1 else ''}. "
        f"They're open {dealer['open_hours']}. Shall I schedule one for you?"
    )


def build_dealer_intelligence(city: str, model: str, variant: str = "", transmission: str = "") -> dict:
    """
    Master function: returns all 5 intelligence variables in one call.
    Used by twilio_handler._build_dynamic_variables().
    """
    return {
        "dealer_info":        get_city_context(city),
        "inventory_status":   get_inventory_context(model, variant, transmission),
        "current_offers":     get_offers_context(model),
        "appointment_prompt": get_dealer_appointment_context(city),
        "city_served":        city.title() if city else "your city",
    }


# ─── Listing helpers (for API endpoints) ─────────────────────────────────────

def list_all_cities() -> list[str]:
    """Returns sorted list of supported city names."""
    return sorted(DEALERSHIPS.keys())


def list_all_models() -> list[str]:
    """Returns sorted list of supported model names."""
    return sorted(INVENTORY.keys())


def get_full_dealer_list() -> list[dict]:
    """Returns flat list of all dealerships across all cities."""
    result = []
    for city, dealers in DEALERSHIPS.items():
        for d in dealers:
            result.append({**d, "city": city.title()})
    return result
