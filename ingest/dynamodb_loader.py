import os
import boto3
from decimal import Decimal


def _prepare_dynamo_item(item: dict) -> dict:
    """Converts floats to Decimal for DynamoDB serialization."""
    prepared = {}
    for k, v in item.items():
        if isinstance(v, float):
            prepared[k] = Decimal(str(v))
        elif isinstance(v, list):
            prepared[k] = [_prepare_dynamo_item(i) if isinstance(i, dict) else i for i in v]
        elif isinstance(v, dict):
            prepared[k] = _prepare_dynamo_item(v)
        else:
            prepared[k] = v
    return prepared


def load_dataset_to_dynamodb(dataset: dict, user_code: str = "u202112345", stage: str = "dev", region: str = "us-east-1") -> dict:
    """
    Batch loads records into AWS DynamoDB tables using Table.batch_writer.
    """
    dynamodb = boto3.resource("dynamodb", region_name=region)
    stats = {}

    table_mapping = {
        "customers": f"openfsm-{user_code}-{stage}-customers",
        "technicians": f"openfsm-{user_code}-{stage}-technicians",
        "workorders": f"openfsm-{user_code}-{stage}-workorders",
        "visits": f"openfsm-{user_code}-{stage}-visits",
        "inventory": f"openfsm-{user_code}-{stage}-inventory",
        "notifications": f"openfsm-{user_code}-{stage}-notifications",
        "users": f"openfsm-{user_code}-{stage}-users"
    }

    for service_name, items in dataset.items():
        table_name = table_mapping.get(service_name)
        if not table_name:
            continue

        print(f"Beginning DynamoDB ingestion into table: {table_name} ({len(items):,} items)...")
        try:
            table = dynamodb.Table(table_name)
            inserted = 0

            with table.batch_writer(overwrite_by_pkeys=["tenant_id", "id"]) as batch:
                for item in items:
                    dynamo_item = _prepare_dynamo_item(item)
                    batch.put_item(Item=dynamo_item)
                    inserted += 1
                    if inserted % 2000 == 0:
                        print(f"  Inserted {inserted:,} / {len(items):,} items into {table_name}")

            stats[service_name] = {"table": table_name, "count": inserted, "status": "SUCCESS"}
            print(f"Completed ingestion for {table_name}: {inserted:,} records.")

        except Exception as exc:
            print(f"Error loading {service_name} into {table_name}: {str(exc)}")
            stats[service_name] = {"table": table_name, "error": str(exc), "status": "FAILED"}

    return stats

