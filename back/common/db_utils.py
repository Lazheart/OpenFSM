import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

_resource = None


def get_dynamodb_resource():
    """Recurso DynamoDB reutilizado entre invocaciones (con endpoint opcional para pruebas locales)."""
    global _resource
    if _resource is None:
        endpoint_url = os.environ.get("DYNAMODB_ENDPOINT")
        region = os.environ.get("AWS_REGION", "us-east-1")
        kwargs = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        _resource = boto3.resource("dynamodb", **kwargs)
    return _resource


def get_table(table_name: str):
    return get_dynamodb_resource().Table(table_name)


def to_dynamo(value):
    """
    DynamoDB no acepta float: boto3 lanza TypeError. Antes esto rompía
    POST /workorders (estimated_hours) y cualquier body con decimales.
    """
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_dynamo(v) for v in value]
    return value


def put_item(table_name: str, item: dict, only_if_new: bool = False) -> dict:
    """
    Inserta/reemplaza un item. Con only_if_new=True falla si la clave ya existe
    (evita que un cliente sobrescriba registros enviando un "id" existente).
    """
    kwargs = {"Item": to_dynamo(item)}
    if only_if_new:
        kwargs["ConditionExpression"] = "attribute_not_exists(id)"
    get_table(table_name).put_item(**kwargs)
    return item


def get_item(table_name: str, tenant_id: str, item_id: str) -> dict:
    response = get_table(table_name).get_item(Key={"tenant_id": tenant_id, "id": item_id})
    return response.get("Item")


def query_by_tenant(table_name: str, tenant_id: str, limit: int = 50, exclusive_start_key: dict = None,
                    newest_first: bool = True) -> tuple:
    """Consulta SOLO la partición del tenant (aislamiento multi-tenant). Devuelve (items, last_key)."""
    kwargs = {
        "KeyConditionExpression": Key("tenant_id").eq(tenant_id),
        "Limit": limit,
        "ScanIndexForward": not newest_first,
    }
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key
    response = get_table(table_name).query(**kwargs)
    return response.get("Items", []), response.get("LastEvaluatedKey")


def update_fields(table_name: str, tenant_id: str, item_id: str, fields: dict, expect: dict = None) -> dict:
    """
    Actualiza solo los campos indicados (en vez de reescribir el item completo,
    que pisaba cambios concurrentes). `expect` agrega condiciones atributo == valor
    (control optimista). Devuelve el item actualizado, o None si no existe o la
    condición no se cumple.
    """
    names, values, sets = {}, {}, []
    for i, (k, v) in enumerate(fields.items()):
        names[f"#f{i}"] = k
        values[f":v{i}"] = to_dynamo(v)
        sets.append(f"#f{i} = :v{i}")
    conds = ["attribute_exists(id)"]
    for i, (k, v) in enumerate((expect or {}).items()):
        names[f"#e{i}"] = k
        values[f":e{i}"] = to_dynamo(v)
        conds.append(f"#e{i} = :e{i}")
    cond = " AND ".join(conds)
    try:
        response = get_table(table_name).update_item(
            Key={"tenant_id": tenant_id, "id": item_id},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression=cond,
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return response.get("Attributes")


def delete_item(table_name: str, tenant_id: str, item_id: str) -> bool:
    """Elimina si existe. Devuelve False si no existía."""
    try:
        get_table(table_name).delete_item(
            Key={"tenant_id": tenant_id, "id": item_id},
            ConditionExpression="attribute_exists(id)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise
    return True


def is_conditional_failure(exc: Exception) -> bool:
    return isinstance(exc, ClientError) and exc.response["Error"]["Code"] == "ConditionalCheckFailedException"
