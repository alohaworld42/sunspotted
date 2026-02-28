import { useEffect, useRef, useCallback } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { useTimeStore } from "../../store/timeStore";
import { useMapStore } from "../../store/mapStore";
import { getSunPosition } from "../../lib/sun/position";
import { calculateShadows } from "../../lib/shadow/projection";
import type { Building } from "../../types/building";
import { BuildingSpatialIndex } from "../../lib/shadow/spatial-index";

const SHADOW_SOURCE_ID = "shadow-source";
const SHADOW_LAYER_ID = "shadow-layer";
/** Buffer around viewport for shadow casters (~200m at European latitudes) */
const VIEWPORT_BUFFER_DEG = 0.002;
const WORKER_THRESHOLD = 200;

interface ShadowLayerProps {
  map: MapLibreMap;
  buildings: Building[];
}

export function ShadowLayer({ map, buildings }: ShadowLayerProps) {
  const currentTime = useTimeStore((s) => s.currentTime);
  const center = useMapStore((s) => s.center);
  const bounds = useMapStore((s) => s.bounds);
  const initializedRef = useRef(false);
  const spatialIndexRef = useRef<BuildingSpatialIndex | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef<number>(0);

  // Keep spatial index in sync with buildings
  useEffect(() => {
    if (!spatialIndexRef.current) {
      spatialIndexRef.current = new BuildingSpatialIndex();
    }
    spatialIndexRef.current.load(buildings);
  }, [buildings]);

  // Lazy-init web worker
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../../workers/shadow.worker.ts", import.meta.url),
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

  const initLayer = useCallback(() => {
    if (initializedRef.current || map.getSource(SHADOW_SOURCE_ID)) return;

    map.addSource(SHADOW_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    // Insert shadows below 3D buildings so they appear on the ground
    const insertBefore = map.getLayer("3d-buildings") ? "3d-buildings" : undefined;

    map.addLayer(
      {
        id: SHADOW_LAYER_ID,
        type: "fill",
        source: SHADOW_SOURCE_ID,
        paint: {
          "fill-color": "#cc0000",
          "fill-opacity": 0.3,
          "fill-antialias": true,
        },
      },
      insertBefore,
    );

    initializedRef.current = true;
  }, [map]);

  useEffect(() => {
    if (map.isStyleLoaded()) {
      initLayer();
    } else {
      map.on("load", initLayer);
    }

    return () => {
      map.off("load", initLayer);
      try {
        if (map.getLayer(SHADOW_LAYER_ID)) map.removeLayer(SHADOW_LAYER_ID);
        if (map.getSource(SHADOW_SOURCE_ID)) map.removeSource(SHADOW_SOURCE_ID);
      } catch {
        // Map may already be removed
      }
      initializedRef.current = false;
    };
  }, [map, initLayer]);

  // Update shadows — viewport-clipped + throttled via rAF
  useEffect(() => {
    if (!initializedRef.current || !bounds) return;

    const source = map.getSource(SHADOW_SOURCE_ID) as GeoJSONSource;
    if (!source) return;

    const sun = getSunPosition(currentTime, center[1], center[0]);

    if (sun.altitude <= 0.01) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    cancelAnimationFrame(frameRef.current);

    frameRef.current = requestAnimationFrame(() => {
      // Only query buildings in/near the visible viewport
      const visibleBuildings = spatialIndexRef.current
        ? spatialIndexRef.current.search([
            bounds[0] - VIEWPORT_BUFFER_DEG,
            bounds[1] - VIEWPORT_BUFFER_DEG,
            bounds[2] + VIEWPORT_BUFFER_DEG,
            bounds[3] + VIEWPORT_BUFFER_DEG,
          ])
        : buildings;

      const buildingInputs = visibleBuildings.map((b) => ({
        id: b.id,
        footprint: b.footprint,
        height: b.height,
      }));

      if (buildingInputs.length > WORKER_THRESHOLD) {
        // Offload to web worker for large datasets
        const worker = getWorker();
        const handler = (event: MessageEvent) => {
          if (event.data.type === "result") {
            const geojson: FeatureCollection<Polygon | MultiPolygon> = {
              type: "FeatureCollection",
              features: event.data.shadows.map(
                (s: { buildingId: string; geometry: Polygon | MultiPolygon }) => ({
                  type: "Feature" as const,
                  properties: { buildingId: s.buildingId },
                  geometry: s.geometry,
                }),
              ),
            };
            source.setData(geojson);
            worker.removeEventListener("message", handler);
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
      } else {
        // Small set — calculate on main thread
        const shadows = calculateShadows(
          buildingInputs,
          sun.azimuth,
          sun.altitude,
          center[1],
        );

        const geojson: FeatureCollection<Polygon | MultiPolygon> = {
          type: "FeatureCollection",
          features: shadows.map((s) => ({
            type: "Feature" as const,
            properties: { buildingId: s.buildingId },
            geometry: s.geometry,
          })),
        };

        source.setData(geojson);
      }
    });

    return () => cancelAnimationFrame(frameRef.current);
  }, [map, currentTime, center, bounds, buildings, getWorker]);

  return null;
}
