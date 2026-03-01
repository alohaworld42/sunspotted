import { useState, useCallback, useRef } from "react";
import type { POI, POISunScore } from "../types/poi";
import { fetchSunnyCafes } from "../lib/poi/sunny-cafe-loader";
import { calculatePOISunScore } from "../lib/poi/sun-score";
import { fetchBuildingsFromOverpass } from "../lib/buildings/loader";
import { BuildingSpatialIndex } from "../lib/shadow/spatial-index";
import { useMapStore } from "../store/mapStore";
import { useTimeStore } from "../store/timeStore";

/**
 * Hook that finds the best sunny cafés in the current viewport.
 * Fetches cafés + buildings, computes sun scores, and ranks them.
 */
export function useSunnyCafes() {
  const [cafes, setCafes] = useState<POI[]>([]);
  const [sunScores, setSunScores] = useState<Map<string, POISunScore>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef(false);

  const findSunnyCafes = useCallback(async () => {
    const bounds = useMapStore.getState().bounds;
    const currentTime = useTimeStore.getState().currentTime;

    if (!bounds) return;

    setIsSearching(true);
    setHasSearched(true);
    abortRef.current = false;

    try {
      // Fetch cafés and buildings in parallel
      const [allCafes, buildings] = await Promise.all([
        fetchSunnyCafes(bounds),
        fetchBuildingsFromOverpass(bounds),
      ]);

      if (abortRef.current) return;

      // Build spatial index for buildings
      const spatialIndex = new BuildingSpatialIndex();
      spatialIndex.load(buildings);

      // Score each café
      const scores = new Map<string, POISunScore>();
      for (const cafe of allCafes) {
        if (abortRef.current) return;
        try {
          const score = calculatePOISunScore(cafe, currentTime, spatialIndex);
          scores.set(cafe.id, score);
        } catch {
          // Skip failed calculations
        }
      }

      // Sort by score descending, outdoor seating first
      const ranked = [...allCafes].sort((a, b) => {
        const scoreA = scores.get(a.id);
        const scoreB = scores.get(b.id);
        // Outdoor seating cafés first
        if (a.hasOutdoor !== b.hasOutdoor) return a.hasOutdoor ? -1 : 1;
        // Then by sun score
        return (scoreB?.score ?? 0) - (scoreA?.score ?? 0);
      });

      setCafes(ranked);
      setSunScores(scores);
    } catch (err) {
      console.error("Sunny café search error:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current = true;
    setCafes([]);
    setSunScores(new Map());
    setHasSearched(false);
    setIsSearching(false);
  }, []);

  return { cafes, sunScores, isSearching, hasSearched, findSunnyCafes, clear };
}
