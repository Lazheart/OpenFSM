import os
import json


def _escape_sql_str(val: str) -> str:
    """Escapes single quotes for SQL insertion."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def export_to_sql(dataset: dict, output_file: str = "output/sql/seed_rds.sql", batch_size: int = 500) -> str:
    """
    Generates multi-tenant SQL INSERT statements compatible with PostgreSQL / MySQL.
    Maps tenant-alpha -> tenant_alpha schema, tenant-beta -> tenant_beta, etc.
    """
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("-- ============================================================================\n")
        f.write("-- OpenFSM: Relational Multi-Tenant Data Seed Script (Single DB, Multiple Schemas)\n")
        f.write("-- ============================================================================\n\n")

        # 1. Customers
        f.write("-- ----------------------------------------------------------------------------\n")
        f.write("-- CUSTOMERS\n")
        f.write("-- ----------------------------------------------------------------------------\n")
        for cust in dataset["customers"]:
            schema = cust["tenant_id"].replace("-", "_")
            f.write(
                f"INSERT INTO {schema}.customers (id, name, tax_id, email, phone, service_address, city, postal_code, contract_type, status, created_at, updated_at) "
                f"VALUES ({_escape_sql_str(cust['id'])}, {_escape_sql_str(cust['name'])}, {_escape_sql_str(cust['tax_id'])}, "
                f"{_escape_sql_str(cust['email'])}, {_escape_sql_str(cust['phone'])}, {_escape_sql_str(cust['service_address'])}, "
                f"{_escape_sql_str(cust['city'])}, {_escape_sql_str(cust['postal_code'])}, {_escape_sql_str(cust['contract_type'])}, "
                f"{_escape_sql_str(cust['status'])}, {_escape_sql_str(cust['created_at'])}, {_escape_sql_str(cust['updated_at'])}) "
                f"ON CONFLICT (id) DO NOTHING;\n"
            )

        # 2. Technicians
        f.write("\n-- ----------------------------------------------------------------------------\n")
        f.write("-- TECHNICIANS\n")
        f.write("-- ----------------------------------------------------------------------------\n")
        for tech in dataset["technicians"]:
            schema = tech["tenant_id"].replace("-", "_")
            skills_json = json.dumps(tech["skills"])
            f.write(
                f"INSERT INTO {schema}.technicians (id, name, email, phone, specialty, skills, certification_level, vehicle_id, status, current_latitude, current_longitude, created_at, updated_at) "
                f"VALUES ({_escape_sql_str(tech['id'])}, {_escape_sql_str(tech['name'])}, {_escape_sql_str(tech['email'])}, "
                f"{_escape_sql_str(tech['phone'])}, {_escape_sql_str(tech['specialty'])}, {_escape_sql_str(skills_json)}::jsonb, "
                f"{_escape_sql_str(tech['certification_level'])}, {_escape_sql_str(tech['vehicle_id'])}, {_escape_sql_str(tech['status'])}, "
                f"{tech['current_latitude']}, {tech['current_longitude']}, {_escape_sql_str(tech['created_at'])}, {_escape_sql_str(tech['updated_at'])}) "
                f"ON CONFLICT (id) DO NOTHING;\n"
            )

        # 3. Inventory Items
        f.write("\n-- ----------------------------------------------------------------------------\n")
        f.write("-- INVENTORY ITEMS\n")
        f.write("-- ----------------------------------------------------------------------------\n")
        for part in dataset["inventory"]:
            schema = part["tenant_id"].replace("-", "_")
            f.write(
                f"INSERT INTO {schema}.inventory_items (id, sku, name, category, unit_cost, unit_price, stock_quantity, warehouse_location, reorder_point, created_at, updated_at) "
                f"VALUES ({_escape_sql_str(part['id'])}, {_escape_sql_str(part['sku'])}, {_escape_sql_str(part['name'])}, "
                f"{_escape_sql_str(part['category'])}, {part['unit_cost']}, {part['unit_price']}, {part['stock_quantity']}, "
                f"{_escape_sql_str(part['warehouse_location'])}, {part['reorder_point']}, {_escape_sql_str(part['created_at'])}, {_escape_sql_str(part['updated_at'])}) "
                f"ON CONFLICT (id) DO NOTHING;\n"
            )

        # 4. Work Orders
        f.write("\n-- ----------------------------------------------------------------------------\n")
        f.write("-- WORK ORDERS\n")
        f.write("-- ----------------------------------------------------------------------------\n")
        for wo in dataset["workorders"]:
            schema = wo["tenant_id"].replace("-", "_")
            f.write(
                f"INSERT INTO {schema}.work_orders (id, customer_id, assigned_technician_id, title, description, priority, status, sla_due_date, estimated_hours, created_by, created_at, updated_at) "
                f"VALUES ({_escape_sql_str(wo['id'])}, {_escape_sql_str(wo['customer_id'])}, {_escape_sql_str(wo['assigned_technician_id'])}, "
                f"{_escape_sql_str(wo['title'])}, {_escape_sql_str(wo['description'])}, {_escape_sql_str(wo['priority'])}, "
                f"{_escape_sql_str(wo['status'])}, {_escape_sql_str(wo['sla_due_date'])}, {wo['estimated_hours']}, "
                f"{_escape_sql_str(wo['created_by'])}, {_escape_sql_str(wo['created_at'])}, {_escape_sql_str(wo['updated_at'])}) "
                f"ON CONFLICT (id) DO NOTHING;\n"
            )

        # 5. Visits
        f.write("\n-- ----------------------------------------------------------------------------\n")
        f.write("-- VISITS\n")
        f.write("-- ----------------------------------------------------------------------------\n")
        for visit in dataset["visits"]:
            schema = visit["tenant_id"].replace("-", "_")
            checklist_json = json.dumps(visit["checklist"])
            photos_json = json.dumps(visit["evidence_photos"])
            act_start = _escape_sql_str(visit['actual_start']) if visit['actual_start'] else "NULL"
            act_end = _escape_sql_str(visit['actual_end']) if visit['actual_end'] else "NULL"
            wo_id = visit.get("workorder_id") or visit.get("work_order_id")

            f.write(
                f"INSERT INTO {schema}.visits (id, work_order_id, technician_id, scheduled_start, scheduled_end, actual_start, actual_end, status, notes, checklist, evidence_photos, signature_key, created_at, updated_at) "
                f"VALUES ({_escape_sql_str(visit['id'])}, {_escape_sql_str(wo_id)}, {_escape_sql_str(visit['technician_id'])}, "
                f"{_escape_sql_str(visit['scheduled_start'])}, {_escape_sql_str(visit['scheduled_end'])}, {act_start}, {act_end}, "
                f"{_escape_sql_str(visit['status'])}, {_escape_sql_str(visit['notes'])}, {_escape_sql_str(checklist_json)}::jsonb, "
                f"{_escape_sql_str(photos_json)}::jsonb, {_escape_sql_str(visit['signature_key'])}, {_escape_sql_str(visit['created_at'])}, {_escape_sql_str(visit['updated_at'])}) "
                f"ON CONFLICT (id) DO NOTHING;\n"
            )

    print(f"Generated SQL seed script at: {output_file}")
    return output_file
