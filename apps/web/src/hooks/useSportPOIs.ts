import { useState, useCallback, useRef, useEffect } from "react";
import type { POI } from "../types/poi";
import { fetchSportPOIs } from "../lib/poi/sport-loader";
import { useMapStore } from "../store/mapStore";

const DEBOUNCE_MS = 800;
const MIN_ZOOM = 13;

/**
 * Hook that fetches outdoor sport facilities (table tennis, volleyball, basketball)
 * from Overpass API. Debounced to avoid excessive requests while panning.
 */
export function useSportPOIs() {
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSports, setShowSports] = useState(false);
  const bounds = useMapStore((s) => s.bounds);
  const zoom = useMapStore((s) => s.zoom);
  const lastBoundsKey = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounced fetch when map moves
  useEffect(() => {
    if (!showSports || !bounds || zoom < MIN_ZOOM) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSports(bounds);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [showSports, bounds, zoom, fetchSports]);

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
