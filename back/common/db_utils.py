import os
import boto3
from boto3.dynamodb.conditions import Key


def get_dynamodb_resource():
    """Returns DynamoDB resource with optional endpoint override for local testing."""
    endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
    region = os.environ.get("AWS_REGION", "us-east-1")
    if endpoint_url:
        return boto3.resource("dynamodb", endpoint_url=endpoint_url, region_name=region)
    return boto3.resource("dynamodb", region_name=region)


def get_table(table_name: str):
    """Retrieves DynamoDB Table instance."""
    dynamodb = get_dynamodb_resource()
    return dynamodb.Table(table_name)


def put_item(table_name: str, item: dict) -> dict:
    """Inserts or overwrites an item in DynamoDB."""
    table = get_table(table_name)
    table.put_item(Item=item)
    return item


def get_item(table_name: str, tenant_id: str, item_id: str) -> dict:
    """Retrieves item by composite primary key (tenant_id, id)."""
    table = get_table(table_name)
    response = table.get_item(
        Key={
            "tenant_id": tenant_id,
            "id": item_id
        }
    )
    return response.get("Item")


def query_by_tenant(table_name: str, tenant_id: str, limit: int = 50, exclusive_start_key: dict = None) -> tuple:
    """
    Queries items strictly by tenant partition key for data isolation.
    Returns (items, last_evaluated_key).
    """
    table = get_table(table_name)
    kwargs = {
        "KeyConditionExpression": Key("tenant_id").eq(tenant_id),
        "Limit": limit
    }
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key

    response = table.query(**kwargs)
    items = response.get("Items", [])
    last_key = response.get("LastEvaluatedKey")
    return items, last_key


def delete_item(table_name: str, tenant_id: str, item_id: str) -> bool:
    """Deletes item by composite primary key (tenant_id, id)."""
    table = get_table(table_name)
    table.delete_item(
        Key={
            "tenant_id": tenant_id,
            "id": item_id
        }
    )
    return True

