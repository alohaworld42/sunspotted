import type { POI, POICategory } from "../../types/poi";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/** Overpass queries for categories fetched via OSM (sports use Vienna WFS instead) */
const CATEGORY_QUERIES: Partial<Record<POICategory, string>> = {
  cafe: 'nwr["amenity"="cafe"]',
  restaurant: 'nwr["amenity"="restaurant"]',
  park: 'nwr["leisure"="park"]',
  beer_garden: 'nwr["amenity"="biergarten"]',
};

/**
 * Fetch POIs from Overpass API within a bounding box.
 */
export async function fetchPOIsFromOverpass(
  bbox: [number, number, number, number],
  categories: POICategory[],
): Promise<POI[]> {
  if (categories.length === 0) return [];

  const [west, south, east, north] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  const unions = categories
    .filter((cat) => CATEGORY_QUERIES[cat])
    .map((cat) => `${CATEGORY_QUERIES[cat]}(${bboxStr});`)
    .join("\n");

  const query = `
    [out:json][timeout:25];
    (
      ${unions}
    );
    out center tags;
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
  return parseOverpassPOIs(data, categories);
}

interface OverpassPOIElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseOverpassPOIs(
  data: { elements: OverpassPOIElement[] },
  categories: POICategory[],
): POI[] {
  const pois: POI[] = [];

  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon || !el.tags) continue;

    const category = detectCategory(el.tags, categories);
    if (!category) continue;

    const hasOutdoor =
      (el.tags.outdoor_seating != null && el.tags.outdoor_seating !== "no") ||
      el.tags.beer_garden === "yes" ||
      category === "park" ||
      category === "beer_garden";

    pois.push({
      id: `osm-poi-${el.id}`,
      osmId: el.id,
      name: el.tags.name || categoryLabel(category),
      category,
      location: [lon, lat],
      hasOutdoor,
      openingHours: el.tags.opening_hours,
      tags: el.tags,
    });
  }

  return pois;
}

function detectCategory(
  tags: Record<string, string>,
  allowed: POICategory[],
): POICategory | null {
  if (allowed.includes("beer_garden") && tags.amenity === "biergarten")
    return "beer_garden";
  if (allowed.includes("cafe") && tags.amenity === "cafe") return "cafe";
  if (allowed.includes("restaurant") && tags.amenity === "restaurant")
    return "restaurant";
  if (allowed.includes("park") && tags.leisure === "park") return "park";
  return null;
}

function categoryLabel(cat: POICategory): string {
  switch (cat) {
    case "cafe":
      return "Café";
    case "restaurant":
      return "Restaurant";
    case "park":
      return "Park";
    case "beer_garden":
      return "Biergarten";
    case "table_tennis":
      return "Tischtennis";
    case "volleyball":
      return "Volleyball";
    case "basketball":
      return "Basketball";
  }
}
