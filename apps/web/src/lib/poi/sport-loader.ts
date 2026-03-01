import type { POI, POICategory } from "../../types/poi";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

interface SportQuery {
  sport: string;
  category: POICategory;
  label: string;
}

const SPORT_QUERIES: SportQuery[] = [
  { sport: "table_tennis", category: "table_tennis", label: "Tischtennis" },
  { sport: "volleyball", category: "volleyball", label: "Volleyball" },
  { sport: "beachvolleyball", category: "volleyball", label: "Beachvolleyball" },
  { sport: "basketball", category: "basketball", label: "Basketball" },
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Fetch sport pitches/tables from Overpass API for exact locations.
 * Queries leisure=pitch + sport=* and standalone sport=table_tennis nodes.
 */
export async function fetchSportPOIs(
  bbox: [number, number, number, number],
): Promise<POI[]> {
  const [west, south, east, north] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  const sportFilters = SPORT_QUERIES.map(
    (q) => `nwr["leisure"="pitch"]["sport"="${q.sport}"](${bboxStr});`,
  ).join("\n");

  const query = `
    [out:json][timeout:25];
    (
      ${sportFilters}
      node["sport"="table_tennis"](${bboxStr});
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
  return parseOverpassSports(data.elements || []);
}

function parseOverpassSports(elements: OverpassElement[]): POI[] {
  const pois: POI[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon || !el.tags) continue;

    const sport = el.tags.sport;
    if (!sport) continue;

    const match = SPORT_QUERIES.find((q) => q.sport === sport);
    if (!match) continue;

    const name = el.tags.name || match.label;

    pois.push({
      id: `sport-${el.type}-${el.id}`,
      osmId: el.id,
      name,
      category: match.category,
      location: [lon, lat],
      hasOutdoor: true,
      tags: el.tags,
    });
  }

  return pois;
}
