import { useEffect, useRef, useState, useCallback } from "react";
import type { Building } from "../types/building";
import type { ShadowPolygon } from "../types/shadow";
import { getSunPosition } from "../lib/sun/position";
import { calculateShadows } from "../lib/shadow/projection";
import { useTimeStore } from "../store/timeStore";
import { useMapStore } from "../store/mapStore";

// Threshold: use web worker above this many buildings
const WORKER_THRESHOLD = 200;

/**
 * Hook that manages shadow calculation, using a Web Worker for large datasets.
 * Falls back to main-thread calculation for small building counts.
 */
export function useShadowCalculation(buildings: Building[]) {
  const currentTime = useTimeStore((s) => s.currentTime);
  const center = useMapStore((s) => s.center);
  const [shadows, setShadows] = useState<ShadowPolygon[]>([]);
  const [computeTime, setComputeTime] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  // Lazy-init worker
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/shadow.worker.ts", import.meta.url),
        { type: "module" },
      );
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (buildings.length === 0) {
      setShadows([]);
      return;
    }

    const sun = getSunPosition(currentTime, center[1], center[0]);

    if (sun.altitude <= 0.01) {
      setShadows([]);
      return;
    }

    const buildingInputs = buildings.map((b) => ({
      id: b.id,
      footprint: b.footprint,
      height: b.height,
    }));

    if (buildings.length > WORKER_THRESHOLD) {
      // Use Web Worker for large datasets
      const worker = getWorker();

      const handler = (event: MessageEvent) => {
        if (event.data.type === "result") {
          setShadows(event.data.shadows);
          setComputeTime(event.data.computeTimeMs);
        }
      };
      worker.addEventListener("message", handler);

      worker.postMessage({
        type: "calculate",
        buildings: buildingInputs,
        sunAzimuth: sun.azimuth,
        sunAltitude: sun.altitude,
        centerLat: center[1],
      });

      return () => {
        worker.removeEventListener("message", handler);
      };
    } else {
      // Small dataset: calculate on main thread
      const t0 = performance.now();
      const result = calculateShadows(buildingInputs, sun.azimuth, sun.altitude, center[1]);
      setComputeTime(performance.now() - t0);
      setShadows(result);
    }
  }, [buildings, currentTime, center, getWorker]);

  return { shadows, computeTime };
}
