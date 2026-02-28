import type { Building } from "../../types/building";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/** Default height per building level in meters */
const HEIGHT_PER_LEVEL = 3.0;

/** Default height when no data is available */
const DEFAULT_HEIGHT = 10.0;

/**
 * Fetch buildings from the Overpass API for a given bounding box.
 * Returns parsed Building objects with estimated heights.
 */
export async function fetchBuildingsFromOverpass(
  bbox: [number, number, number, number],
): Promise<Building[]> {
  const [west, south, east, north] = bbox;

  // Overpass QL query: fetch buildings with geometry
  const query = `
    [out:json][timeout:30];
    (
      way["building"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data: OverpassResponse = await response.json();
  return parseOverpassBuildings(data);
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{ type: string; ref: number; role: string }>;
  tags?: Record<string, string>;
}

/**
 * Parse Overpass API response into Building objects.
 */
function parseOverpassBuildings(data: OverpassResponse): Building[] {
  // Build a lookup of node coordinates
  const nodes = new Map<number, [number, number]>();
  for (const el of data.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  const buildings: Building[] = [];

  for (const el of data.elements) {
    if (el.type !== "way" || !el.tags?.building || !el.nodes) continue;

    // Build polygon coordinates from node references
    const coords: [number, number][] = [];
    let valid = true;

    for (const nodeId of el.nodes) {
      const coord = nodes.get(nodeId);
      if (!coord) {
        valid = false;
        break;
      }
      coords.push(coord);
    }

    if (!valid || coords.length < 4) continue;

    // Ensure polygon is closed
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([...first] as [number, number]);
    }

    const height = estimateHeight(el.tags);
    const centroid = calculateCentroid(coords);
    const bbox = calculateBBox(coords);

    buildings.push({
      id: `osm-${el.id}`,
      osmId: el.id,
      footprint: {
        type: "Polygon",
        coordinates: [coords],
      },
      height,
      levels: el.tags["building:levels"]
        ? parseInt(el.tags["building:levels"], 10)
        : undefined,
      heightSource: el.tags.height ? "osm" : "estimated",
      centroid,
      bbox,
    });
  }

  return buildings;
}

/**
 * Estimate building height from OSM tags.
 * Priority: height tag > levels tag > default estimate by building type.
 */
function estimateHeight(tags: Record<string, string>): number {
  // Explicit height tag (e.g., "height"="25")
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h) && h > 0) return h;
  }

  // Estimate from levels
  if (tags["building:levels"]) {
    const levels = parseInt(tags["building:levels"], 10);
    if (!isNaN(levels) && levels > 0) {
      return levels * HEIGHT_PER_LEVEL;
    }
  }

  // Estimate by building type
  const type = tags.building;
  switch (type) {
    case "church":
    case "cathedral":
      return 25;
    case "tower":
      return 30;
    case "industrial":
    case "warehouse":
      return 12;
    case "garage":
    case "garages":
      return 3;
    case "shed":
    case "hut":
      return 3;
    case "house":
    case "detached":
      return 8;
    case "apartments":
    case "residential":
      return 15;
    case "commercial":
    case "office":
      return 18;
    case "retail":
      return 6;
    default:
      return DEFAULT_HEIGHT;
  }
}

function calculateCentroid(coords: [number, number][]): [number, number] {
  let sumLng = 0;
  let sumLat = 0;
  // Exclude last point (duplicate of first for closed polygon)
  const n = coords.length - 1;
  for (let i = 0; i < n; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLng / n, sumLat / n];
}

function calculateBBox(
  coords: [number, number][],
): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}
