import type { POI, POICategory } from "../../types/poi";

/** Vienna OGD WFS endpoint for sport facilities */
const WFS_URL =
  "https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&typeName=ogdwien:SPORTSTAETTENOGD&srsName=EPSG:4326&outputFormat=json";

interface SportMapping {
  keyword: string;
  category: POICategory;
  label: string;
}

const SPORT_MAPPINGS: SportMapping[] = [
  { keyword: "tischtennis", category: "table_tennis", label: "Tischtennis" },
  { keyword: "beachvolleyball", category: "volleyball", label: "Beachvolleyball" },
  { keyword: "volleyball", category: "volleyball", label: "Volleyball" },
  { keyword: "basketball", category: "basketball", label: "Basketball" },
];

/** Outdoor category number in Vienna OGD data */
const OUTDOOR_CATEGORY = 3;

interface WFSFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    OBJECTID: number;
    KATEGORIE_TXT: string;
    KATEGORIE_NUM: number;
    ADRESSE: string;
    FLAECHE: number;
    SPORTSTAETTEN_ART: string;
    WEBLINK1: string | null;
  };
}

/** Cache all Vienna sport POIs after first fetch */
let cachedPOIs: POI[] | null = null;

/**
 * Fetch outdoor sport facilities from Vienna OGD WFS.
 * Data is cached after first request (~1500 entries, small payload).
 * Returns only POIs within the given bounding box.
 */
export async function fetchSportPOIs(
  bbox: [number, number, number, number],
): Promise<POI[]> {
  if (!cachedPOIs) {
    const response = await fetch(WFS_URL);
    if (!response.ok) throw new Error(`Vienna WFS error: ${response.status}`);
    const data = await response.json();
    cachedPOIs = parseWFSFeatures(data.features || []);
  }

  const [west, south, east, north] = bbox;
  return cachedPOIs.filter((poi) => {
    const [lng, lat] = poi.location;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  });
}

function parseWFSFeatures(features: WFSFeature[]): POI[] {
  const pois: POI[] = [];

  for (const feature of features) {
    const props = feature.properties;
    if (!props || !feature.geometry?.coordinates) continue;

    // Only outdoor facilities
    if (props.KATEGORIE_NUM !== OUTDOOR_CATEGORY) continue;

    const sportArt = (props.SPORTSTAETTEN_ART || "").toLowerCase();
    const [lng, lat] = feature.geometry.coordinates;

    // Create one POI per matched sport type (a facility can have multiple)
    const seen = new Set<POICategory>();
    for (const mapping of SPORT_MAPPINGS) {
      if (sportArt.includes(mapping.keyword) && !seen.has(mapping.category)) {
        seen.add(mapping.category);
        pois.push({
          id: `wien-sport-${props.OBJECTID}-${mapping.category}`,
          name: `${mapping.label} — ${props.ADRESSE}`,
          category: mapping.category,
          location: [lng, lat],
          hasOutdoor: true,
          tags: {
            sport_type: props.SPORTSTAETTEN_ART,
            address: props.ADRESSE,
          },
        });
      }
    }
  }

  return pois;
}
