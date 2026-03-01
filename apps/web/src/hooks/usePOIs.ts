import { useState, useCallback, useRef, useEffect } from "react";
import type { POI, POICategory } from "../types/poi";
import { fetchPOIsFromOverpass } from "../lib/poi/loader";
import { useAnalysisStore } from "../store/analysisStore";

/** Radius around selected point for POI search (~400m) */
const POI_RADIUS_DEG = 0.004;

/**
 * Hook that fetches cafés from Overpass API near the selected analysis point.
 * Only fetches cafés (no restaurants/beer gardens). Off by default.
 */
export function usePOIs() {
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);
  const selectedPoint = useAnalysisStore((s) => s.selectedPoint);
  const lastFetchKey = useRef<string | null>(null);

  const fetchPOIs = useCallback(async (point: [number, number]) => {
    const [lng, lat] = point;
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;

    const bbox: [number, number, number, number] = [
      lng - POI_RADIUS_DEG,
      lat - POI_RADIUS_DEG,
      lng + POI_RADIUS_DEG,
      lat + POI_RADIUS_DEG,
    ];

    setIsLoading(true);
    try {
      const categories: POICategory[] = ["cafe"];
      const results = await fetchPOIsFromOverpass(bbox, categories);
      setPois(results);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("POI fetch error:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-fetch when a point is selected and POIs are enabled
  useEffect(() => {
    if (showPOIs && selectedPoint) {
      fetchPOIs(selectedPoint);
    }
  }, [showPOIs, selectedPoint, fetchPOIs]);

  const togglePOIs = useCallback(() => {
    setShowPOIs((prev) => {
      const next = !prev;
      if (!next) {
        setPois([]);
        lastFetchKey.current = null;
      }
      return next;
    });
  }, []);

  const refetch = useCallback(() => {
    if (showPOIs && selectedPoint) {
      lastFetchKey.current = null;
      fetchPOIs(selectedPoint);
    }
  }, [showPOIs, selectedPoint, fetchPOIs]);

  return { pois, isLoading, showPOIs, togglePOIs, refetch };
}
