import { useState, useCallback, useRef, useEffect } from "react";
import type { POI } from "../types/poi";
import { fetchSportPOIs } from "../lib/poi/sport-loader";
import { useMapStore } from "../store/mapStore";

/**
 * Hook that fetches outdoor sport facilities (table tennis, volleyball, basketball)
 * from the Vienna OGD WFS API. Data is cached after first load and filtered
 * by the current map bounds.
 */
export function useSportPOIs() {
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSports, setShowSports] = useState(false);
  const bounds = useMapStore((s) => s.bounds);
  const lastBoundsKey = useRef<string | null>(null);

  const fetchSports = useCallback(async (bbox: [number, number, number, number]) => {
    const key = bbox.map((v) => v.toFixed(3)).join(",");
    if (key === lastBoundsKey.current) return;
    lastBoundsKey.current = key;

    setIsLoading(true);
    try {
      const results = await fetchSportPOIs(bbox);
      setPois(results);
    } catch (err) {
      console.error("Sport POI fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-filter when map moves or toggle changes
  useEffect(() => {
    if (showSports && bounds) {
      fetchSports(bounds);
    }
  }, [showSports, bounds, fetchSports]);

  const toggleSports = useCallback(() => {
    setShowSports((prev) => {
      const next = !prev;
      if (!next) {
        setPois([]);
        lastBoundsKey.current = null;
      }
      return next;
    });
  }, []);

  return { pois, isLoading, showSports, toggleSports };
}
