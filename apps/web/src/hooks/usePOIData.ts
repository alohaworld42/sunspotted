import { useEffect, useRef, useState, useCallback } from "react";
import type { POI, POISunScore } from "../types/poi";
import type { Building } from "../types/building";
import { fetchPOIsFromOverpass } from "../lib/poi/loader";
import { calculatePOISunScore } from "../lib/poi/sun-score";
import { useMapStore } from "../store/mapStore";
import { useFilterStore } from "../store/filterStore";
import { useTimeStore } from "../store/timeStore";
import { BuildingSpatialIndex } from "../lib/shadow/spatial-index";

const FETCH_DEBOUNCE_MS = 800;
const MIN_ZOOM_FOR_POIS = 14;

/**
 * Hook that fetches POI data and calculates sun scores.
 * Only active when showPOIs is enabled in the filter store.
 */
export function usePOIData(buildings: Building[]) {
  const bounds = useMapStore((s) => s.bounds);
  const zoom = useMapStore((s) => s.zoom);
  const categories = useFilterStore((s) => s.categories);
  const showPOIs = useFilterStore((s) => s.showPOIs);
  const minSunMinutes = useFilterStore((s) => s.minSunMinutes);
  const sortBy = useFilterStore((s) => s.sortBy);
  const currentTime = useTimeStore((s) => s.currentTime);

  const [pois, setPOIs] = useState<POI[]>([]);
  const [sunScores, setSunScores] = useState<Map<string, POISunScore>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, POI[]>>(new Map());
  const indexRef = useRef<BuildingSpatialIndex | null>(null);

  // Load POIs when viewport / categories change
  useEffect(() => {
    if (!showPOIs || !bounds || zoom < MIN_ZOOM_FOR_POIS) {
      setPOIs([]);
      setSunScores(new Map());
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      loadPOIs(bounds, categories);
    }, FETCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bounds, zoom, categories, showPOIs]);

  async function loadPOIs(
    bbox: [number, number, number, number],
    cats: typeof categories,
  ) {
    const cacheKey = `${bbox.map((v) => v.toFixed(3)).join(",")}_${cats.join(",")}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPOIs(cached);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchPOIsFromOverpass(bbox, cats);
      setPOIs(data);
      cacheRef.current.set(cacheKey, data);
      if (cacheRef.current.size > 20) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
    } catch (err) {
      console.error("POI fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Calculate sun scores when POIs or time changes
  const calculateScores = useCallback(() => {
    if (pois.length === 0 || buildings.length === 0) {
      setSunScores(new Map());
      return;
    }

    setIsScoring(true);

    // Build spatial index
    if (!indexRef.current) {
      indexRef.current = new BuildingSpatialIndex();
    }
    indexRef.current.load(buildings);

    requestAnimationFrame(() => {
      const scores = new Map<string, POISunScore>();
      for (const poi of pois) {
        try {
          const score = calculatePOISunScore(poi, currentTime, indexRef.current!);
          scores.set(poi.id, score);
        } catch {
          // Skip failed calculations
        }
      }
      setSunScores(scores);
      setIsScoring(false);
    });
  }, [pois, buildings, currentTime]);

  useEffect(() => {
    if (showPOIs) calculateScores();
  }, [showPOIs, calculateScores]);

  // Filter and sort
  const filteredPOIs = pois
    .filter((poi) => {
      if (minSunMinutes <= 0) return true;
      const score = sunScores.get(poi.id);
      return score ? score.sunMinutesNext3Hours >= minSunMinutes : true;
    })
    .sort((a, b) => {
      const scoreA = sunScores.get(a.id);
      const scoreB = sunScores.get(b.id);
      if (sortBy === "sun_duration") {
        return (scoreB?.score ?? 0) - (scoreA?.score ?? 0);
      }
      return 0;
    });

  return { pois: filteredPOIs, sunScores, isLoading, isScoring };
}
