import type { POI } from "../../types/poi";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/**
 * Fetch cafés and beer gardens with outdoor seating from Overpass API.
 * Uses multiple tags: outdoor_seating, beer_garden, garden, terrace.
 * Prioritizes places that explicitly have outdoor seating.
 */
export async function fetchSunnyCafes(
  bbox: [number, number, number, number],
): Promise<POI[]> {
  const [west, south, east, north] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  // Query cafés, restaurants, and beer gardens — then filter for outdoor seating in code
  // Also query nodes/ways/relations that explicitly have outdoor_seating tag
  const query = `
    [out:json][timeout:25];
    (
      nwr["amenity"="cafe"](${bboxStr});
      nwr["amenity"="biergarten"](${bboxStr});
      nwr["amenity"="restaurant"]["outdoor_seating"]["outdoor_seating"!="no"](${bboxStr});
      nwr["amenity"="restaurant"]["cuisine"~"ice_cream|coffee"](${bboxStr});
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
  return parseSunnyCafes(data.elements || []);
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseSunnyCafes(elements: OverpassElement[]): POI[] {
  const pois: POI[] = [];
  const seen = new Set<number>();

  for (const el of elements) {
    if (seen.has(el.id)) continue;
    seen.add(el.id);

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon || !el.tags) continue;

    const hasOutdoor =
      (el.tags.outdoor_seating != null && el.tags.outdoor_seating !== "no") ||
      el.tags.beer_garden === "yes" ||
      el.tags.amenity === "biergarten" ||
      el.tags.garden === "yes" ||
      el.tags["outdoor_seating:type"] != null;

    const category =
      el.tags.amenity === "biergarten" ? "beer_garden" as const :
      el.tags.amenity === "cafe" ? "cafe" as const :
      "restaurant" as const;

    pois.push({
      id: `sunny-${el.id}`,
      osmId: el.id,
      name: el.tags.name || (category === "beer_garden" ? "Biergarten" : "Café"),
      category,
      location: [lon, lat],
      hasOutdoor,
      openingHours: el.tags.opening_hours,
      tags: el.tags,
    });
  }

  return pois;
}
