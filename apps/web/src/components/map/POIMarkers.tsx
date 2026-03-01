import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { POI, POICategory, POISunScore } from "../../types/poi";

interface POIMarkersProps {
  map: MapLibreMap;
  pois: POI[];
  sunScores: Map<string, POISunScore>;
  onSelect: (poi: POI) => void;
}

const CATEGORY_ICONS: Record<POICategory, string> = {
  cafe: "\u2615",
  restaurant: "\uD83C\uDF7D\uFE0F",
  beer_garden: "\uD83C\uDF7A",
  park: "\uD83C\uDF33",
  table_tennis: "\uD83C\uDFD3",
  volleyball: "\uD83C\uDFD0",
  basketball: "\uD83C\uDFC0",
};

export function POIMarkers({ map, pois, sunScores, onSelect }: POIMarkersProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    // Clear existing markers
    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];

    // Create new markers
    for (const poi of pois) {
      const score = sunScores.get(poi.id);
      const inSun = score?.currentlyInSun ?? false;
      const sunPct = score?.score ?? 0;

      const el = document.createElement("div");
      el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:32px;height:32px;border-radius:50%;cursor:pointer;
        font-size:16px;
        background:${inSun ? "rgba(251,191,36,0.9)" : "rgba(255,255,255,0.9)"};
        border:2px solid ${sunBorderColor(sunPct)};
        box-shadow:0 2px 6px rgba(0,0,0,0.2);
        transition:transform 0.15s;
      `;
      el.textContent = CATEGORY_ICONS[poi.category];
      el.title = `${poi.name} — ${inSun ? "Sonne" : "Schatten"} (Score: ${sunPct})`;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(poi);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(poi.location)
        .addTo(map);

      markersRef.current.push(marker);
    }

    return () => {
      for (const m of markersRef.current) {
        m.remove();
      }
      markersRef.current = [];
    };
  }, [map, pois, sunScores, onSelect]);

  return null;
}

function sunBorderColor(score: number): string {
  if (score >= 70) return "#f59e0b"; // amber - sunny
  if (score >= 40) return "#fb923c"; // orange - partial
  return "#9ca3af"; // gray - shaded
}
