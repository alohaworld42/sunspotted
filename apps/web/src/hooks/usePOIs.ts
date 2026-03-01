import { useState, useCallback, useRef } from "react";
import type { POI, POICategory } from "../types/poi";
import { fetchPOIsFromOverpass } from "../lib/poi/loader";
import { useMapStore } from "../store/mapStore";

/**
 * Hook that fetches POIs (cafés, restaurants, etc.) from Overpass API
 * for the current map viewport. Debounces requests and caches results.
 */
export function usePOIs() {
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);
  const bounds = useMapStore((s) => s.bounds);
  const lastFetchBounds = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPOIs = useCallback(async () => {
    if (!bounds) return;

    // Simple dedup: don't refetch if bounds haven't changed much
    const boundsKey = bounds.map((b) => b.toFixed(3)).join(",");
    if (boundsKey === lastFetchBounds.current) return;
    lastFetchBounds.current = boundsKey;

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    try {
      const categories: POICategory[] = ["cafe", "restaurant", "beer_garden"];
      const results = await fetchPOIsFromOverpass(bounds, categories);
      setPois(results);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("POI fetch error:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [bounds]);

  const togglePOIs = useCallback(() => {
    setShowPOIs((prev) => {
      const next = !prev;
      if (next) {
        // Fetch on enable
        fetchPOIs();
      } else {
        setPois([]);
        lastFetchBounds.current = null;
      }
      return next;
    });
  }, [fetchPOIs]);

  const refetch = useCallback(() => {
    if (showPOIs) {
      lastFetchBounds.current = null; // force refetch
      fetchPOIs();
    }
  }, [showPOIs, fetchPOIs]);

  return { pois, isLoading, showPOIs, togglePOIs, refetch };
}
