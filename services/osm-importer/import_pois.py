#!/usr/bin/env python3
"""
Import POIs (cafes, restaurants, parks, beer gardens) from OSM into PostGIS.
"""

import argparse
import sys

import psycopg2
import requests
from tqdm import tqdm

OVERPASS_API = "https://overpass-api.de/api/interpreter"

CITIES = {
    "munich": (48.06, 11.36, 48.25, 11.72),
    "berlin": (52.34, 13.09, 52.68, 13.76),
    "vienna": (48.12, 16.18, 48.32, 16.58),
    "zurich": (47.32, 8.45, 47.43, 8.62),
}

# Map OSM tags to our categories
CATEGORY_MAP = {
    "cafe": "cafe",
    "restaurant": "restaurant",
    "biergarten": "beer_garden",
    "beer_garden": "beer_garden",
}


def fetch_pois(bbox: tuple[float, float, float, float]) -> list[dict]:
    south, west, north, east = bbox
    query = f"""
    [out:json][timeout:60];
    (
      node["amenity"="cafe"]({south},{west},{north},{east});
      node["amenity"="restaurant"]({south},{west},{north},{east});
      node["amenity"="biergarten"]({south},{west},{north},{east});
      node["leisure"="park"]({south},{west},{north},{east});
      way["leisure"="park"]({south},{west},{north},{east});
    );
    out body;
    >;
    out skel qt;
    """

    print(f"Fetching POIs...")
    resp = requests.post(OVERPASS_API, data={"data": query}, timeout=90)
    resp.raise_for_status()
    data = resp.json()

    pois = []
    for el in data["elements"]:
        if el["type"] != "node" or "tags" not in el:
            continue

        tags = el["tags"]
        name = tags.get("name", "")

        # Determine category
        if tags.get("leisure") == "park":
            category = "park"
        elif tags.get("amenity") in CATEGORY_MAP:
            category = CATEGORY_MAP[tags["amenity"]]
        else:
            continue

        has_outdoor = tags.get("outdoor_seating") == "yes" or category in ("park", "beer_garden")

        pois.append({
            "osm_id": el["id"],
            "name": name,
            "category": category,
            "lat": el["lat"],
            "lon": el["lon"],
            "has_outdoor": has_outdoor,
            "outdoor_seating": tags.get("outdoor_seating"),
            "opening_hours": tags.get("opening_hours"),
            "tags": tags,
        })

    print(f"Found {len(pois)} POIs")
    return pois


def insert_pois(pois: list[dict], conn_str: str):
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()

    insert_sql = """
    INSERT INTO pois (osm_id, name, category, location, has_outdoor, outdoor_seating, opening_hours, tags)
    VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s)
    ON CONFLICT (osm_id) DO UPDATE SET
        name = EXCLUDED.name,
        has_outdoor = EXCLUDED.has_outdoor,
        updated_at = NOW()
    """

    import json
    inserted = 0
    for poi in tqdm(pois, desc="Inserting POIs"):
        try:
            cur.execute(insert_sql, (
                poi["osm_id"],
                poi["name"],
                poi["category"],
                poi["lon"],
                poi["lat"],
                poi["has_outdoor"],
                poi["outdoor_seating"],
                poi["opening_hours"],
                json.dumps(poi["tags"]),
            ))
            inserted += 1
        except Exception as e:
            print(f"Error: {e}")
            conn.rollback()
            continue
    conn.commit()
    cur.close()
    conn.close()
    print(f"Inserted/updated {inserted} POIs")


def main():
    parser = argparse.ArgumentParser(description="Import OSM POIs into PostGIS")
    parser.add_argument("--city", choices=list(CITIES.keys()), required=True)
    parser.add_argument("--db", type=str,
                       default="host=localhost port=5432 dbname=sunspotted user=sunspotted password=sunspotted")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pois = fetch_pois(CITIES[args.city])

    if not args.dry_run:
        insert_pois(pois, args.db)
    else:
        print(f"Dry run: would insert {len(pois)} POIs")


if __name__ == "__main__":
    main()
