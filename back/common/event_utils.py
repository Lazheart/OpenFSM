import os
import json
import boto3
from botocore.config import Config


def get_sns_client():
    region = os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("sns", region_name=region)


def get_s3_client():
    region = os.environ.get("AWS_REGION", "us-east-1")
    return boto3.client("s3", region_name=region, config=Config(signature_version="s3v4"))


def publish_event(topic_arn: str, event_type: str, tenant_id: str, payload: dict) -> dict:
    """
    Publishes an event to SNS with tenant_id and event_type message attributes.
    """
    if not topic_arn:
        # Fallback when running without configured SNS topic
        return {"status": "skipped", "reason": "No topic ARN configured"}

    sns = get_sns_client()
    message = json.dumps(payload)
    message_attributes = {
        "eventType": {
            "DataType": "String",
            "StringValue": event_type
        },
        "tenantId": {
            "DataType": "String",
            "StringValue": tenant_id
        }
    }

    response = sns.publish(
        TopicArn=topic_arn,
        Message=message,
        Subject=f"FSM Event: {event_type}",
        MessageAttributes=message_attributes
    )
    return response


def generate_presigned_upload_url(bucket_name: str, object_key: str, expires_in: int = 3600) -> str:
    """
    Generates an S3 presigned PUT URL for secure direct uploads (e.g., photo evidence, signatures).
    """
    s3 = get_s3_client()
    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket_name,
            "Key": object_key
        },
        ExpiresIn=expires_in
    )
    return url


def generate_presigned_download_url(bucket_name: str, object_key: str, expires_in: int = 3600) -> str:
    """
    Generates an S3 presigned GET URL for secure file reading.
    """
    s3 = get_s3_client()
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket_name,
            "Key": object_key
        },
        ExpiresIn=expires_in
    )
    return url

