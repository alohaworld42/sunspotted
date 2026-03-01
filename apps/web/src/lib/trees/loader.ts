import type { Polygon } from "geojson";
import type { Tree } from "../../types/tree";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const METERS_PER_DEGREE_LAT = 111_320;

/** Default tree height when no data available */
const DEFAULT_HEIGHT = 10;
/** Default canopy radius in meters */
const DEFAULT_CANOPY_RADIUS = 4;
/** Segments for circular canopy polygon */
const CANOPY_SEGMENTS = 12;
/** Spacing between interpolated trees along a tree_row (meters) */
const TREE_ROW_SPACING = 8;
/** Spacing for synthetic trees inside wooded areas (meters) */
const WOOD_GRID_SPACING = 10;
/** Max synthetic trees per wooded polygon to avoid performance issues */
const MAX_TREES_PER_AREA = 80;

function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
}

function metersToDegreesLat(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

/**
 * Create a circular polygon approximation for a tree canopy.
 */
function createCanopyPolygon(
  center: [number, number],
  radiusMeters: number,
  lat: number,
): Polygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= CANOPY_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CANOPY_SEGMENTS;
    const dx = metersToDegreesLng(radiusMeters * Math.cos(angle), lat);
    const dy = metersToDegreesLat(radiusMeters * Math.sin(angle));
    coords.push([center[0] + dx, center[1] + dy]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function estimateTreeHeight(tags: Record<string, string>): number {
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h) && h > 0) return h;
  }
  if (tags.est_height) {
    const h = parseFloat(tags.est_height);
    if (!isNaN(h) && h > 0) return h;
  }
  if (tags.leaf_type === "needleleaved") return 15;
  return DEFAULT_HEIGHT;
}

function estimateCanopyRadius(tags: Record<string, string>): number {
  if (tags.diameter_crown) {
    const d = parseFloat(tags.diameter_crown);
    if (!isNaN(d) && d > 0) return d / 2;
  }
  return DEFAULT_CANOPY_RADIUS;
}

function parseLeafCycle(tags: Record<string, string>): "deciduous" | "evergreen" | undefined {
  const lc = tags.leaf_cycle;
  if (lc === "deciduous" || lc === "semi_deciduous") return "deciduous";
  if (lc === "evergreen" || lc === "semi_evergreen") return "evergreen";
  return undefined;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

/**
 * Fetch trees from the Overpass API for a given bounding box.
 */
export async function fetchTreesFromOverpass(
  bbox: [number, number, number, number],
): Promise<Tree[]> {
  const [west, south, east, north] = bbox;

  const query = `
    [out:json][timeout:30];
    (
      node["natural"="tree"](${south},${west},${north},${east});
      way["natural"="tree_row"](${south},${west},${north},${east});
      way["natural"="wood"](${south},${west},${north},${east});
      way["landuse"="forest"](${south},${west},${north},${east});
      relation["natural"="wood"](${south},${west},${north},${east});
      relation["landuse"="forest"](${south},${west},${north},${east});
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

  const data = await response.json();
  return parseOverpassTrees(data.elements || []);
}

function parseOverpassTrees(elements: OverpassElement[]): Tree[] {
  const trees: Tree[] = [];

  // Build node coordinate lookup for tree_row ways
  const nodes = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  for (const el of elements) {
    if (el.type === "node" && el.tags?.natural === "tree") {
      if (el.lon === undefined || el.lat === undefined) continue;
      const tags = el.tags;
      const location: [number, number] = [el.lon, el.lat];
      const height = estimateTreeHeight(tags);
      const canopyRadius = estimateCanopyRadius(tags);

      trees.push({
        id: `tree-${el.id}`,
        osmId: el.id,
        location,
        height,
        canopyRadius,
        canopyFootprint: createCanopyPolygon(location, canopyRadius, el.lat),
        leafCycle: parseLeafCycle(tags),
      });
    }

    if (el.type === "way" && el.tags?.natural === "tree_row" && el.nodes) {
      const tags = el.tags;
      const height = estimateTreeHeight(tags);
      const canopyRadius = estimateCanopyRadius(tags);
      const leafCycle = parseLeafCycle(tags);

      // Resolve coordinates along the row
      const wayCoords: [number, number][] = [];
      for (const nodeId of el.nodes) {
        const coord = nodes.get(nodeId);
        if (coord) wayCoords.push(coord);
      }

      if (wayCoords.length < 2) continue;

      // Interpolate individual trees along the row
      const rowTrees = interpolateTreeRow(wayCoords, TREE_ROW_SPACING);
      for (let i = 0; i < rowTrees.length; i++) {
        const loc = rowTrees[i];
        trees.push({
          id: `treerow-${el.id}-${i}`,
          osmId: el.id,
          location: loc,
          height,
          canopyRadius,
          canopyFootprint: createCanopyPolygon(loc, canopyRadius, loc[1]),
          leafCycle,
        });
      }
    }

    // Wooded areas (natural=wood, landuse=forest) — fill with synthetic trees
    if (el.type === "way" && el.nodes &&
        (el.tags?.natural === "wood" || el.tags?.landuse === "forest")) {
      const tags = el.tags;
      const height = estimateTreeHeight(tags);
      const canopyRadius = estimateCanopyRadius(tags);
      const leafCycle = parseLeafCycle(tags);

      const wayCoords: [number, number][] = [];
      for (const nodeId of el.nodes) {
        const coord = nodes.get(nodeId);
        if (coord) wayCoords.push(coord);
      }

      if (wayCoords.length < 4) continue;

      // Close polygon if needed
      const first = wayCoords[0];
      const last = wayCoords[wayCoords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        wayCoords.push([...first] as [number, number]);
      }

      const syntheticTrees = fillPolygonWithTrees(
        wayCoords, WOOD_GRID_SPACING, height, canopyRadius, leafCycle, `wood-${el.id}`,
      );
      trees.push(...syntheticTrees);
    }
  }

  return trees;
}

/**
 * Fill a polygon area with synthetic trees on a grid.
 * Uses a simple point-in-polygon test (ray casting).
 */
function fillPolygonWithTrees(
  polygon: [number, number][],
  spacingMeters: number,
  height: number,
  canopyRadius: number,
  leafCycle: "deciduous" | "evergreen" | undefined,
  idPrefix: string,
): Tree[] {
  const trees: Tree[] = [];

  // Compute bbox of the polygon
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of polygon) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  // Convert spacing to degrees
  const centerLat = (minLat + maxLat) / 2;
  const stepLng = metersToDegreesLng(spacingMeters, centerLat);
  const stepLat = metersToDegreesLat(spacingMeters);

  let count = 0;
  for (let lng = minLng + stepLng / 2; lng < maxLng; lng += stepLng) {
    for (let lat = minLat + stepLat / 2; lat < maxLat; lat += stepLat) {
      if (count >= MAX_TREES_PER_AREA) break;
      if (pointInPolygon(lng, lat, polygon)) {
        const loc: [number, number] = [lng, lat];
        trees.push({
          id: `${idPrefix}-${count}`,
          location: loc,
          height,
          canopyRadius,
          canopyFootprint: createCanopyPolygon(loc, canopyRadius, lat),
          leafCycle,
        });
        count++;
      }
    }
    if (count >= MAX_TREES_PER_AREA) break;
  }

  return trees;
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Interpolate tree positions along a polyline at regular spacing.
 */
function interpolateTreeRow(
  coords: [number, number][],
  spacingMeters: number,
): [number, number][] {
  const result: [number, number][] = [coords[0]];
  let accumulated = 0;

  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];

    const dLng = (lng2 - lng1) * METERS_PER_DEGREE_LAT * Math.cos((lat1 * Math.PI) / 180);
    const dLat = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
    const segLen = Math.sqrt(dLng * dLng + dLat * dLat);

    let remaining = segLen;
    let offset = spacingMeters - accumulated;

    while (offset <= remaining) {
      const t = (segLen - remaining + offset) / segLen;
      const lng = lng1 + t * (lng2 - lng1);
      const lat = lat1 + t * (lat2 - lat1);
      result.push([lng, lat]);
      remaining -= offset;
      offset = spacingMeters;
    }

    accumulated = remaining;
  }

  return result;
}

/**
 * Get effective canopy radius accounting for seasonality.
 * Deciduous trees lose most foliage Nov–Feb in the Northern Hemisphere.
 */
export function effectiveCanopyRadius(tree: Tree, date: Date): number {
  if (tree.leafCycle === "deciduous") {
    const month = date.getMonth(); // 0-indexed
    if (month >= 10 || month <= 1) {
      return tree.canopyRadius * 0.3; // bare branches
    }
  }
  return tree.canopyRadius;
}
