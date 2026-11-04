import os
import json


def export_to_json(dataset: dict, output_dir: str = "output/json") -> dict:
    """
    Exports generated FSM datasets to JSON files categorized by microservice.
    """
    os.makedirs(output_dir, exist_ok=True)
    stats = {}

    for service_name, items in dataset.items():
        file_path = os.path.join(output_dir, f"{service_name}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        stats[service_name] = {
            "file": file_path,
            "record_count": len(items),
            "size_mb": round(os.path.getsize(file_path) / (1024 * 1024), 2)
        }
        print(f"Exported {len(items):,} records to {file_path} ({stats[service_name]['size_mb']} MB)")

    return stats

