import { useEffect, useRef, useState } from "react";
import type { Building } from "../types/building";
import { fetchBuildingsFromOverpass } from "../lib/buildings/loader";
import { useMapStore } from "../store/mapStore";
import {
  getCachedBuildings,
  setCachedBuildings,
} from "../lib/cache/idb-building-cache";

const FETCH_DEBOUNCE_MS = 500;
const MIN_ZOOM_FOR_BUILDINGS = 14;

/**
 * Hook that fetches building data from Overpass API based on map viewport.
 * Includes debouncing and caching to avoid excessive API calls.
 */
export function useBuildingData() {
  const bounds = useMapStore((s) => s.bounds);
  const zoom = useMapStore((s) => s.zoom);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, Building[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!bounds || zoom < MIN_ZOOM_FOR_BUILDINGS) {
      setBuildings([]);
      return;
    }

    // Debounce fetching
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      loadBuildings(bounds);
    }, FETCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [bounds, zoom]);

  async function loadBuildings(bbox: [number, number, number, number]) {
    // Round to reduce unique cache keys
    const cacheKey = bbox.map((v) => v.toFixed(4)).join(",");

    // Check in-memory cache first
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setBuildings(cached);
      return;
    }

    // Check IndexedDB cache
    const idbCached = await getCachedBuildings(cacheKey);
    if (idbCached) {
      setBuildings(idbCached);
      cacheRef.current.set(cacheKey, idbCached);
      return;
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchBuildingsFromOverpass(bbox);
      setBuildings(data);

      // Cache result in memory and IndexedDB
      cacheRef.current.set(cacheKey, data);
      setCachedBuildings(cacheKey, data);

      // Limit cache size
      if (cacheRef.current.size > 50) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load buildings";
      setError(message);
      console.error("Building fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return { buildings, isLoading, error };
}
