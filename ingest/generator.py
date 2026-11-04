import random
import uuid
from datetime import datetime, timedelta, timezone


TENANTS_CONFIG = [
    {
        "id": "tenant-alpha",
        "name": "Apex HVAC Solutions",
        "industry": "HVAC",
        "specialties": ["HVAC Maintenance", "Chiller Repair", "Air Conditioning", "Duct Cleaning", "Heat Pumps"],
        "parts": [
            ("COMP-501", "Rotary Compressor 5HP", "Compressors", 450.0, 750.0),
            ("FILT-102", "HEPA Industrial Air Filter", "Filters", 15.0, 35.0),
            ("THERM-204", "Digital Smart Thermostat", "Controls", 65.0, 140.0),
            ("FAN-303", "Condenser Fan Motor 1/2HP", "Motors", 120.0, 220.0),
            ("VALV-401", "Thermostatic Expansion Valve", "Valves", 45.0, 95.0),
            ("REFR-134", "R-410A Refrigerant Cylinder 25lb", "Chemicals", 180.0, 310.0),
            ("CAP-105", "Dual Run Capacitor 45/5 MFD", "Electrical", 12.0, 30.0),
            ("CONT-201", "Single Pole Defrost Contactor", "Electrical", 18.0, 42.0)
        ],
        "problems": [
            "AC unit blowing lukewarm air in server room",
            "Chiller compressor loud grinding noise and vibration",
            "Thermostat unresponsive and displaying error code E-42",
            "Severe water leakage around indoor air handling unit",
            "Scheduled biannual preventative HVAC maintenance",
            "Rooftop condenser coil freezing up under load",
            "Emergency ventilation failure in production cleanroom"
        ]
    },
    {
        "id": "tenant-beta",
        "name": "BlueSky Telecom Services",
        "industry": "Telecommunications",
        "specialties": ["Fiber Optic Splicing", "5G Tower Alignment", "Microwave Links", "Network Routers", "Data Cabling"],
        "parts": [
            ("FIBR-001", "Single Mode Fiber Patch Cord 10m", "Cabling", 12.0, 28.0),
            ("SFP-10G", "10GBASE-LR SFP+ Transceiver", "Optics", 85.0, 180.0),
            ("ROUT-C9", "Enterprise Core Switch 48-Port", "Hardware", 1200.0, 2200.0),
            ("SPLICE-T", "Fusion Splice Protection Sleeves (100pk)", "Consumables", 14.0, 32.0),
            ("ANT-5G", "MIMO Sector Antenna 3.5GHz", "RF Equipment", 350.0, 680.0),
            ("UPS-3000", "Rackmount Battery Backup 3000VA", "Power", 480.0, 890.0),
            ("OTDR-AD", "Optical Connector Adapter SC/APC", "Optics", 8.0, 20.0),
            ("CAB-CAT6", "Cat6A Shielded Bulk Cable 1000ft", "Cabling", 140.0, 260.0)
        ],
        "problems": [
            "Fiber trunk cut along highway construction sector",
            "High packet loss and latency on base transceiver station",
            "Optical signal attenuation exceeding -28dBm threshold",
            "Cell tower RF power amplifier alert",
            "Scheduled firmware upgrade and link optimization",
            "Emergency backup battery failure at microwave repeater",
            "Customer premises enterprise WAN circuit degradation"
        ]
    },
    {
        "id": "tenant-gamma",
        "name": "GreenField Electrical & Power",
        "industry": "Electrical",
        "specialties": ["Substation Maintenance", "Industrial Switchgear", "Solar Inverters", "Transformer Testing", "Emergency Power"],
        "parts": [
            ("BRK-400A", "Molded Case Circuit Breaker 400A", "Switchgear", 380.0, 680.0),
            ("SOL-INV5", "Commercial Solar Inverter 50kW", "Solar", 3200.0, 5400.0),
            ("REL-DIFF", "Microprocessor Differential Protection Relay", "Relays", 950.0, 1800.0),
            ("FUSE-60A", "High-Voltage Current Limiting Fuse 60A", "Fuses", 65.0, 135.0),
            ("OIL-DIE", "Transformer Dielectric Mineral Oil 55gal", "Chemicals", 420.0, 780.0),
            ("PAN-SURG", "Surge Protection Device Type 2", "Protection", 110.0, 230.0),
            ("MTR-3PH", "Three-Phase Multi-Function Power Meter", "Meters", 240.0, 480.0),
            ("BUS-CU", "Insulated Copper Busbar 1000A 2m", "Conductors", 190.0, 360.0)
        ],
        "problems": [
            "Medium voltage circuit breaker trip on thermal overload",
            "Solar string inverter grounding fault F-09",
            "Transformer oil dissolved gas analysis anomaly",
            "Emergency diesel generator automatic transfer failure",
            "Annual thermographic infrared inspection of switchgear",
            "Harmonic distortion causing sensitive PLC resets",
            "Substation lightning protection ground grid high resistance"
        ]
    }
]

FIRST_NAMES = [
    "Carlos", "Alejandro", "Maria", "Sofia", "Jorge", "Mateo", "Valentina", "David", "Lucas", "Camila",
    "Juan", "Diego", "Andres", "Gabriel", "Isabella", "Fernando", "Lucia", "Rodrigo", "Sebastian", "Elena",
    "Ricardo", "Patricia", "Manuel", "Paula", "Daniel", "Natalia", "Javier", "Victoria", "Gonzalo", "Adriana"
]

LAST_NAMES = [
    "Rodriguez", "Hernandez", "Lopez", "Garcia", "Perez", "Sanchez", "Ramirez", "Torres", "Flores", "Diaz",
    "Morales", "Reyes", "Gutierrez", "Ortiz", "Castillo", "Mendoza", "Vargas", "Silva", "Ramos", "Castro",
    "Romero", "Alvarez", "Gomez", "Medina", "Navarro", "Salazar", "Rios", "Fernandez", "Paredes", "Quispe"
]

CITIES = [
    ("Lima", "15001"), ("Arequipa", "04001"), ("Trujillo", "13001"), ("Chiclayo", "14001"),
    ("Piura", "20001"), ("Cusco", "08001"), ("Huancayo", "12001"), ("Tacna", "23001"),
    ("Bogota", "110111"), ("Medellin", "050001"), ("Cali", "760001"), ("Santiago", "8320000")
]

STREETS = [
    "Av. Javier Prado", "Av. Benavides", "Av. Salaverry", "Av. La Marina", "Av. Arequipa",
    "Calle Los Pinos", "Av. Primavera", "Av. Paseo de la Republica", "Av. Canaval y Moreyra",
    "Calle Las Camelias", "Av. El Derby", "Av. Tomas Marsano", "Calle Las Begonias"
]

COMPANIES = [
    "Corporacion Logistica Andina", "Banco Mercantil Internacional", "Hospital Regional Metropolitano",
    "Centro Comercial Plaza Real", "Manufacturas Textiles del Pacifico", "Cadena de Supermercados Uno",
    "Laboratorios Biomedicos Unidos", "Hotel Gran Libertador", "Universidad Central Tecnologica",
    "Minera Aurifera del Sur", "Agroindustrias del Valle", "Almacenes Generales Frontera"
]


def generate_fsm_dataset(records_per_tenant: int = 10000, seed: int = 42):
    """
    Generates realistic synthetic FSM data for 3 tenants across 5 microservices:
    - Customers: records_per_tenant * 3
    - Technicians: records_per_tenant * 3
    - Work Orders: records_per_tenant * 3
    - Visits: records_per_tenant * 3
    - Inventory: records_per_tenant * 3
    Total records generated = records_per_tenant * 15 (e.g. 150,000 for 10k).
    """
    random.seed(seed)
    dataset = {
        "customers": [],
        "technicians": [],
        "workorders": [],
        "visits": [],
        "inventory": []
    }

    base_date = datetime(2026, 1, 1, 8, 0, 0, tzinfo=timezone.utc)

    for tenant in TENANTS_CONFIG:
        tenant_id = tenant["id"]
        industry = tenant["industry"]

        # ----------------------------------------------------
        # 1. GENERATE CUSTOMERS
        # ----------------------------------------------------
        tenant_customers = []
        for i in range(1, records_per_tenant + 1):
            city, zip_code = random.choice(CITIES)
            street = random.choice(STREETS)
            street_num = random.randint(100, 4500)
            comp_base = random.choice(COMPANIES)
            company_name = f"{comp_base} #{i}" if i > len(COMPANIES) else comp_base
            tax_id = f"20{random.randint(100000000, 999999999)}"
            created_ts = (base_date + timedelta(minutes=i * 12)).isoformat()

            cust = {
                "tenant_id": tenant_id,
                "id": f"CUST#{tenant_id[:4]}-{i:06d}",
                "name": company_name,
                "tax_id": tax_id,
                "email": f"contacto.sede{i}@{tenant_id}.com",
                "phone": f"+51 9{random.randint(10000000, 99999999)}",
                "service_address": f"{street} {street_num}",
                "city": city,
                "postal_code": zip_code,
                "contract_type": random.choice(["STANDARD", "PREMIUM", "ENTERPRISE"]),
                "status": random.choice(["ACTIVE", "ACTIVE", "ACTIVE", "INACTIVE"]),
                "created_at": created_ts,
                "updated_at": created_ts
            }
            tenant_customers.append(cust)
        dataset["customers"].extend(tenant_customers)

        # ----------------------------------------------------
        # 2. GENERATE TECHNICIANS
        # ----------------------------------------------------
        tenant_technicians = []
        for i in range(1, records_per_tenant + 1):
            fname = random.choice(FIRST_NAMES)
            lname = random.choice(LAST_NAMES)
            spec = random.choice(tenant["specialties"])
            created_ts = (base_date + timedelta(minutes=i * 15)).isoformat()
            lat = round(-12.046374 + random.uniform(-0.15, 0.15), 6)
            lon = round(-77.042793 + random.uniform(-0.15, 0.15), 6)

            tech = {
                "tenant_id": tenant_id,
                "id": f"TECH#{tenant_id[:4]}-{i:06d}",
                "name": f"{fname} {lname}",
                "email": f"{fname.lower()}.{lname.lower()}{i}@{tenant_id}.com",
                "phone": f"+51 9{random.randint(10000000, 99999999)}",
                "specialty": spec,
                "skills": [spec, "Safety Level 2", "Diagnostic Tools"],
                "certification_level": random.choice(["LEVEL_1", "LEVEL_2", "SENIOR", "LEAD_ENGINEER"]),
                "vehicle_id": f"VEH-{tenant_id[:2].upper()}-{100 + (i % 900)}",
                "status": random.choice(["AVAILABLE", "AVAILABLE", "ON_DUTY", "ON_DUTY", "ON_LEAVE"]),
                "current_latitude": str(lat),
                "current_longitude": str(lon),
                "created_at": created_ts,
                "updated_at": created_ts
            }
            tenant_technicians.append(tech)
        dataset["technicians"].extend(tenant_technicians)

        # ----------------------------------------------------
        # 3. GENERATE INVENTORY
        # ----------------------------------------------------
        tenant_inventory = []
        parts_catalog = tenant["parts"]
        for i in range(1, records_per_tenant + 1):
            base_sku, base_name, cat, cost, price = parts_catalog[(i - 1) % len(parts_catalog)]
            sku = f"{base_sku}-{i:05d}"
            part_name = f"{base_name} Model {i}"
            created_ts = (base_date + timedelta(minutes=i * 10)).isoformat()

            item = {
                "tenant_id": tenant_id,
                "id": f"PART#{tenant_id[:4]}-{i:06d}",
                "sku": sku,
                "name": part_name,
                "category": cat,
                "unit_cost": float(cost),
                "unit_price": float(price),
                "stock_quantity": random.randint(15, 500),
                "warehouse_location": f"Warehouse-{chr(65 + (i % 4))}-Bay-{i % 25}",
                "reorder_point": random.randint(10, 30),
                "created_at": created_ts,
                "updated_at": created_ts
            }
            tenant_inventory.append(item)
        dataset["inventory"].extend(tenant_inventory)

        # ----------------------------------------------------
        # 4. GENERATE WORK ORDERS
        # ----------------------------------------------------
        tenant_workorders = []
        for i in range(1, records_per_tenant + 1):
            cust_idx = (i - 1) % len(tenant_customers)
            tech_idx = (i - 1) % len(tenant_technicians)
            customer_ref = tenant_customers[cust_idx]["id"]
            technician_ref = tenant_technicians[tech_idx]["id"]
            problem = random.choice(tenant["problems"])
            created_dt = base_date + timedelta(minutes=i * 8)
            sla_dt = created_dt + timedelta(hours=random.choice([4, 12, 24, 48]))
            priority = random.choice(["LOW", "NORMAL", "NORMAL", "HIGH", "EMERGENCY"])
            status = random.choice(["CREATED", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "COMPLETED"])

            wo = {
                "tenant_id": tenant_id,
                "id": f"WO#{tenant_id[:4]}-{i:06d}",
                "customer_id": customer_ref,
                "assigned_technician_id": technician_ref,
                "title": f"[{industry}] {problem[:50]}",
                "description": f"{problem}. Reported at customer location {tenant_customers[cust_idx]['name']}.",
                "priority": priority,
                "status": status,
                "sla_due_date": sla_dt.isoformat(),
                "estimated_hours": float(random.choice([1.5, 2.0, 3.5, 4.0, 8.0])),
                "created_by": f"dispatcher-{tenant_id}",
                "created_at": created_dt.isoformat(),
                "updated_at": created_dt.isoformat()
            }
            tenant_workorders.append(wo)
        dataset["workorders"].extend(tenant_workorders)

        # ----------------------------------------------------
        # 5. GENERATE VISITS
        # ----------------------------------------------------
        tenant_visits = []
        for i in range(1, records_per_tenant + 1):
            wo_idx = (i - 1) % len(tenant_workorders)
            wo_ref = tenant_workorders[wo_idx]
            tech_ref = wo_ref["assigned_technician_id"]
            wo_id = wo_ref["id"]

            start_dt = datetime.fromisoformat(wo_ref["created_at"]) + timedelta(hours=random.randint(1, 10))
            end_dt = start_dt + timedelta(hours=random.choice([1, 2, 3]))

            status = random.choice(["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "COMPLETED"])
            actual_start = start_dt.isoformat() if status in ["IN_PROGRESS", "COMPLETED"] else ""
            actual_end = end_dt.isoformat() if status == "COMPLETED" else ""
            signature = f"s3://openfsm-{tenant_id}-evidence/signatures/{wo_id}.png" if status == "COMPLETED" else ""

            visit = {
                "tenant_id": tenant_id,
                "id": f"VISIT#{tenant_id[:4]}-{i:06d}",
                "workorder_id": wo_id,
                "technician_id": tech_ref,
                "scheduled_start": start_dt.isoformat(),
                "scheduled_end": end_dt.isoformat(),
                "actual_start": actual_start,
                "actual_end": actual_end,
                "status": status,
                "notes": f"Field inspection executed. Parameters verified within manufacturer tolerance.",
                "checklist": [
                    {"item": "Personal Protective Equipment Verified", "passed": True},
                    {"item": "System Diagnostic Self-Test", "passed": True},
                    {"item": "Customer Signoff Received", "passed": status == "COMPLETED"}
                ],
                "evidence_photos": [
                    f"s3://openfsm-{tenant_id}-evidence/visits/{wo_id}/photo_before.jpg",
                    f"s3://openfsm-{tenant_id}-evidence/visits/{wo_id}/photo_after.jpg"
                ] if status == "COMPLETED" else [],
                "signature_key": signature,
                "created_at": start_dt.isoformat(),
                "updated_at": end_dt.isoformat()
            }
            tenant_visits.append(visit)
        dataset["visits"].extend(tenant_visits)

    return dataset

