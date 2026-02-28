#!/usr/bin/env python3
"""
Import building data from OpenStreetMap via Overpass API into PostGIS.
Supports the entire DACH region or specific cities.
"""

import argparse
import json
import math
import sys
import time

import psycopg2
import requests
from shapely.geometry import shape, Polygon
from tqdm import tqdm

OVERPASS_API = "https://overpass-api.de/api/interpreter"

# Predefined city bounding boxes (south, west, north, east)
CITIES = {
    "munich": (48.06, 11.36, 48.25, 11.72),
    "berlin": (52.34, 13.09, 52.68, 13.76),
    "vienna": (48.12, 16.18, 48.32, 16.58),
    "zurich": (47.32, 8.45, 47.43, 8.62),
    "hamburg": (53.40, 9.73, 53.66, 10.18),
    "cologne": (50.83, 6.82, 51.02, 7.12),
    "frankfurt": (50.05, 8.55, 50.20, 8.80),
    "stuttgart": (48.69, 9.04, 48.84, 9.28),
}

HEIGHT_PER_LEVEL = 3.0
DEFAULT_HEIGHTS = {
    "church": 25, "cathedral": 25, "tower": 30,
    "industrial": 12, "warehouse": 12,
    "garage": 3, "garages": 3, "shed": 3, "hut": 3,
    "house": 8, "detached": 8,
    "apartments": 15, "residential": 15,
    "commercial": 18, "office": 18,
    "retail": 6,
}
DEFAULT_HEIGHT = 10.0
TILE_ZOOM = 15


def lng_lat_to_tile(lng: float, lat: float, zoom: int) -> tuple[int, int]:
    """Convert lng/lat to tile x/y at given zoom level."""
    n = 2 ** zoom
    x = int((lng + 180) / 360 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y


def estimate_height(tags: dict) -> tuple[float, str]:
    """Estimate building height from OSM tags. Returns (height, source)."""
    if "height" in tags:
        try:
            h = float(tags["height"].replace("m", "").strip())
            if h > 0:
                return h, "osm"
        except ValueError:
            pass

    if "building:levels" in tags:
        try:
            levels = int(tags["building:levels"])
            if levels > 0:
                return levels * HEIGHT_PER_LEVEL, "estimated"
        except ValueError:
            pass

    building_type = tags.get("building", "yes")
    h = DEFAULT_HEIGHTS.get(building_type, DEFAULT_HEIGHT)
    return h, "estimated"


def fetch_buildings(bbox: tuple[float, float, float, float], timeout: int = 120) -> list[dict]:
    """Fetch buildings from Overpass API for the given bbox."""
    south, west, north, east = bbox
    query = f"""
    [out:json][timeout:{timeout}];
    (
      way["building"]({south},{west},{north},{east});
    );
    out body;
    >;
    out skel qt;
    """

    print(f"Fetching buildings for bbox ({south:.4f},{west:.4f},{north:.4f},{east:.4f})...")
    resp = requests.post(OVERPASS_API, data={"data": query}, timeout=timeout + 30)
    resp.raise_for_status()
    data = resp.json()

    # Build node lookup
    nodes = {}
    for el in data["elements"]:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])

    buildings = []
    for el in data["elements"]:
        if el["type"] != "way" or "building" not in el.get("tags", {}):
            continue

        coords = []
        valid = True
        for nid in el.get("nodes", []):
            if nid not in nodes:
                valid = False
                break
            coords.append(nodes[nid])

        if not valid or len(coords) < 4:
            continue

        # Ensure closed polygon
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        try:
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or not poly.is_valid:
                continue
        except Exception:
            continue

        tags = el.get("tags", {})
        height, height_source = estimate_height(tags)
        centroid = poly.centroid

        tile_x, tile_y = lng_lat_to_tile(centroid.x, centroid.y, TILE_ZOOM)

        buildings.append({
            "osm_id": el["id"],
            "footprint": poly.wkt,
            "height": height,
            "height_source": height_source,
            "levels": tags.get("building:levels"),
            "roof_shape": tags.get("roof:shape"),
            "building_type": tags.get("building"),
            "min_height": float(tags.get("min_height", 0)) if "min_height" in tags else 0,
            "tile_x": tile_x,
            "tile_y": tile_y,
            "centroid_wkt": centroid.wkt,
        })

    print(f"Parsed {len(buildings)} buildings from {len(data['elements'])} elements")
    return buildings


def insert_buildings(buildings: list[dict], conn_str: str, batch_size: int = 500):
    """Insert buildings into PostGIS database."""
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()

    insert_sql = """
    INSERT INTO buildings (osm_id, footprint, height, height_source, levels,
                          roof_shape, building_type, min_height, tile_x, tile_y, tile_z, centroid)
    VALUES (%s, ST_GeomFromText(%s, 4326), %s, %s, %s, %s, %s, %s, %s, %s, %s,
            ST_GeomFromText(%s, 4326))
    ON CONFLICT (osm_id) DO UPDATE SET
        footprint = EXCLUDED.footprint,
        height = EXCLUDED.height,
        height_source = EXCLUDED.height_source,
        levels = EXCLUDED.levels,
        updated_at = NOW()
    """

    inserted = 0
    for i in tqdm(range(0, len(buildings), batch_size), desc="Inserting"):
        batch = buildings[i:i + batch_size]
        for b in batch:
            try:
                cur.execute(insert_sql, (
                    b["osm_id"],
                    b["footprint"],
                    b["height"],
                    b["height_source"],
                    int(b["levels"]) if b["levels"] else None,
                    b["roof_shape"],
                    b["building_type"],
                    b["min_height"],
                    b["tile_x"],
                    b["tile_y"],
                    TILE_ZOOM,
                    b["centroid_wkt"],
                ))
                inserted += 1
            except Exception as e:
                print(f"Error inserting building {b['osm_id']}: {e}")
                conn.rollback()
                continue
        conn.commit()

    cur.close()
    conn.close()
    print(f"Inserted/updated {inserted} buildings")


def main():
    parser = argparse.ArgumentParser(description="Import OSM buildings into PostGIS")
    parser.add_argument("--city", choices=list(CITIES.keys()),
                       help="Import buildings for a predefined city")
    parser.add_argument("--bbox", type=str,
                       help="Custom bbox: south,west,north,east")
    parser.add_argument("--db", type=str,
                       default="host=localhost port=5432 dbname=sunspotted user=sunspotted password=sunspotted",
                       help="PostgreSQL connection string")
    parser.add_argument("--dry-run", action="store_true",
                       help="Fetch data but don't insert into database")
    parser.add_argument("--output", type=str,
                       help="Save fetched data to JSON file")

    args = parser.parse_args()

    if args.city:
        bbox = CITIES[args.city]
    elif args.bbox:
        bbox = tuple(float(x) for x in args.bbox.split(","))
        if len(bbox) != 4:
            print("Error: bbox must have 4 values: south,west,north,east")
            sys.exit(1)
    else:
        print("Error: specify --city or --bbox")
        sys.exit(1)

    buildings = fetch_buildings(bbox)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(buildings, f, indent=2, default=str)
        print(f"Saved {len(buildings)} buildings to {args.output}")

    if not args.dry_run:
        insert_buildings(buildings, args.db)
    else:
        print(f"Dry run: would insert {len(buildings)} buildings")


if __name__ == "__main__":
    main()
