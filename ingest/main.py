import os
import sys
import time
import argparse

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from generator import generate_fsm_dataset, TENANTS_CONFIG
from json_exporter import export_to_json
from sql_exporter import export_to_sql
from dynamodb_loader import load_dataset_to_dynamodb


def parse_args():
    parser = argparse.ArgumentParser(
        description="OpenFSM Synthetic Data Ingestion Engine (Multi-Tenant & Multi-Microservice)"
    )
    parser.add_argument(
        "--records-per-tenant",
        type=int,
        default=10000,
        help="Number of records per tenant per microservice. Default: 10000 (produces 30,000 per microservice across 3 tenants)."
    )
    parser.add_argument(
        "--output",
        choices=["all", "json", "sql", "dynamodb"],
        default="all",
        help="Destination for generated records. Options: all, json, sql, dynamodb. Default: all."
    )
    parser.add_argument(
        "--user-code",
        type=str,
        default=os.environ.get("USER_CODE", "u202112345"),
        help="AWS Learner user code or student ID for resource naming prefix. Default: u202112345."
    )
    parser.add_argument(
        "--stage",
        type=str,
        default=os.environ.get("STAGE", "dev"),
        help="Serverless deployment stage. Default: dev."
    )
    parser.add_argument(
        "--region",
        type=str,
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS region. Default: us-east-1."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=os.path.join(os.path.dirname(__file__), "output"),
        help="Output directory for generated JSON and SQL files."
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Fast test run: generates 100 records per tenant per microservice (1,500 total records)."
    )
    return parser.parse_args()


def main():
    args = parse_args()
    records_per_tenant = 100 if args.sample else args.records_per_tenant
    tenant_count = len(TENANTS_CONFIG)
    total_per_service = records_per_tenant * tenant_count
    total_records = total_per_service * 5

    print("=================================================================")
    print("OpenFSM: Synthetic Data Ingestion Generator")
    print("=================================================================")
    print(f"Tenants configured     : {tenant_count} {[t['id'] for t in TENANTS_CONFIG]}")
    print(f"Records per tenant     : {records_per_tenant:,}")
    print(f"Records per service    : {total_per_service:,} (across {tenant_count} tenants)")
    print(f"Total synthetic records: {total_records:,} (5 microservices)")
    print(f"Deployment Stage       : {args.stage}")
    print(f"User Code Prefix       : {args.user_code}")
    print(f"Output Mode            : {args.output}")
    print(f"Target Directory       : {args.output_dir}")
    print("=================================================================")

    start_time = time.time()
    print("Generating synthetic datasets in memory...")
    dataset = generate_fsm_dataset(records_per_tenant=records_per_tenant)
    generation_time = round(time.time() - start_time, 2)
    print(f"Dataset generated in {generation_time} seconds.\n")

    # JSON Export
    if args.output in ["all", "json"]:
        print("--- JSON Export ---")
        json_dir = os.path.join(args.output_dir, "json")
        export_to_json(dataset, output_dir=json_dir)
        print()

    # SQL Export
    if args.output in ["all", "sql"]:
        print("--- SQL Export (RDS Single Database, Multiple Schemas) ---")
        sql_file = os.path.join(args.output_dir, "sql", "seed_rds.sql")
        export_to_sql(dataset, output_file=sql_file)
        print()

    # DynamoDB Batch Load
    if args.output in ["all", "dynamodb"]:
        print("--- DynamoDB Direct Ingestion ---")
        try:
            results = load_dataset_to_dynamodb(
                dataset=dataset,
                user_code=args.user_code,
                stage=args.stage,
                region=args.region
            )
            print(f"DynamoDB Load Summary: {results}")
        except Exception as exc:
            print(f"DynamoDB Ingestion skipped or failed: {str(exc)}")
            print("To load into AWS DynamoDB, ensure active AWS credentials and deployed tables.")
        print()

    total_time = round(time.time() - start_time, 2)
    print("=================================================================")
    print(f"Ingestion process finished in {total_time} seconds.")
    print("Summary of generated records:")
    for service, items in dataset.items():
        print(f"  - Microservice {service.upper():<12}: {len(items):,} records")
    print("=================================================================")


if __name__ == "__main__":
    main()

