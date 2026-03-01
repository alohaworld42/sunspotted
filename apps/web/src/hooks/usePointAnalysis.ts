import { useCallback } from "react";
import * as turf from "@turf/turf";
import type { Building } from "../types/building";
import type { Tree } from "../types/tree";
import type { PointAnalysisResult, TimeSlot } from "../types/analysis";
import { getSunPosition, getSunTimes } from "../lib/sun/position";
import { calculateFullShadows, calculateSimpleShadows } from "../lib/shadow/projection";
import { useAnalysisStore } from "../store/analysisStore";
import { useTimeStore } from "../store/timeStore";
import { fetchBuildingsFromOverpass } from "../lib/buildings/loader";
import { fetchTreesFromOverpass, effectiveCanopyRadius } from "../lib/trees/loader";
import type { ShadowPolygon } from "../types/shadow";
import {
  isWasmReady,
  analyzePointWasm,
  calculateShadowsWasm,
  calculateTreeShadowsWasm,
} from "../lib/wasm/engine";

const SIMULATION_INTERVAL_MIN = 10;
/** Radius in degrees around the clicked point to fetch buildings (~150m) */
const ANALYSIS_RADIUS_DEG = 0.0015;

/**
 * Compute tree shadows for a given sun position.
 * Uses convex hull approach (robust for small canopy polygons).
 */
function calculateTreeShadows(
  trees: Tree[],
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
  date: Date,
): ShadowPolygon[] {
  if (sunAltitude <= 0.01) return [];

  const sinAngle = Math.sin(sunAzimuth);
  const cosAngle = Math.cos(sunAzimuth);
  const shadows: ShadowPolygon[] = [];

  for (const tree of trees) {
    const radius = effectiveCanopyRadius(tree, date);
    const canopy = createSeasonalCanopy(tree.location, radius, tree.location[1]);
    const coords = canopy.coordinates[0];

    const shadowLength = tree.height / Math.tan(sunAltitude);
    const dxDeg = shadowLength * sinAngle / (METERS_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180));
    const dyDeg = shadowLength * cosAngle / METERS_PER_DEGREE_LAT;

    const shadowCoords = coords.map((c) => [c[0] + dxDeg, c[1] + dyDeg]);

    try {
      const allPoints = turf.featureCollection([
        ...coords.map((c) => turf.point(c)),
        ...shadowCoords.map((c) => turf.point(c)),
      ]);
      const hull = turf.convex(allPoints);
      if (hull) {
        shadows.push({
          buildingId: tree.id,
          geometry: hull.geometry as GeoJSON.Polygon,
          sourceType: "tree",
        });
      }
    } catch {
      // Skip invalid geometry
    }
  }
  return shadows;
}

const METERS_PER_DEGREE_LAT = 111_320;

function createSeasonalCanopy(
  center: [number, number],
  radiusMeters: number,
  lat: number,
): GeoJSON.Polygon {
  const segments = 12;
  const coords: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const dx = radiusMeters * Math.cos(angle) / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
    const dy = radiusMeters * Math.sin(angle) / METERS_PER_DEGREE_LAT;
    coords.push([center[0] + dx, center[1] + dy]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

/**
 * Hook that performs point-in-sun/shade analysis when the user clicks on the map.
 * Fetches buildings and trees on-demand around the clicked point from Overpass API,
 * then simulates the entire day in 10-minute intervals.
 */
export function usePointAnalysis() {
  const setSelectedPoint = useAnalysisStore((s) => s.setSelectedPoint);
  const setAnalysisResult = useAnalysisStore((s) => s.setAnalysisResult);
  const setAnalyzing = useAnalysisStore((s) => s.setAnalyzing);
  const setAnalysisShadows = useAnalysisStore((s) => s.setAnalysisShadows);
  const setTreeShadowsStore = useAnalysisStore((s) => s.setTreeShadows);
  const setAnalysisBuildings = useAnalysisStore((s) => s.setAnalysisBuildings);
  const setAnalysisTrees = useAnalysisStore((s) => s.setAnalysisTrees);
  const currentTime = useTimeStore((s) => s.currentTime);

  const analyzePoint = useCallback(
    async (lngLat: [number, number]) => {
      setSelectedPoint(lngLat);
      setAnalyzing(true);
      setAnalysisShadows([]);
      setTreeShadowsStore([]);
      setAnalysisBuildings([]);
      setAnalysisTrees([]);

      try {
        const [lng, lat] = lngLat;

        // Fetch buildings and trees around the clicked point in parallel
        const bbox: [number, number, number, number] = [
          lng - ANALYSIS_RADIUS_DEG,
          lat - ANALYSIS_RADIUS_DEG,
          lng + ANALYSIS_RADIUS_DEG,
          lat + ANALYSIS_RADIUS_DEG,
        ];

        const [buildings, trees] = await Promise.all([
          fetchBuildingsFromOverpass(bbox),
          fetchTreesFromOverpass(bbox).catch(() => [] as Tree[]),
        ]);

        setAnalysisBuildings(buildings);
        setAnalysisTrees(trees);

        // Try WASM first, fall back to JS
        const useWasm = isWasmReady();
        let result: PointAnalysisResult | null = null;

        if (useWasm) {
          result = analyzePointWasm(lngLat, buildings, trees, currentTime);
        }
        if (!result) {
          // JS fallback
          result = computeAnalysis(lngLat, buildings, trees, currentTime);
        }
        setAnalysisResult(result);

        // Compute current shadows for map display
        const sun = getSunPosition(currentTime, lat, lng);
        if (sun.altitude > 0.01) {
          // Try WASM shadows, fall back to JS
          let shadows: ShadowPolygon[] | null = null;
          if (useWasm) {
            shadows = calculateShadowsWasm(buildings, sun.azimuth, sun.altitude, lat);
          }
          if (!shadows) {
            const buildingInputs = buildings.map((b) => ({
              id: b.id, footprint: b.footprint, height: b.height,
            }));
            shadows = calculateSimpleShadows(buildingInputs, sun.azimuth, sun.altitude, lat);
          }
          setAnalysisShadows(shadows);

          // Tree shadows
          if (trees.length > 0) {
            let tShadows: ShadowPolygon[] | null = null;
            if (useWasm) {
              tShadows = calculateTreeShadowsWasm(
                trees, sun.azimuth, sun.altitude, lat, currentTime.getMonth() + 1,
              );
            }
            if (!tShadows) {
              tShadows = calculateTreeShadows(trees, sun.azimuth, sun.altitude, lat, currentTime);
            }
            setTreeShadowsStore(tShadows);
          }
        }
      } catch (err) {
        console.error("Point analysis error:", err);
        setAnalysisResult(null);
      } finally {
        setAnalyzing(false);
      }
    },
    [currentTime, setSelectedPoint, setAnalysisResult, setAnalyzing, setAnalysisShadows, setTreeShadowsStore, setAnalysisBuildings, setAnalysisTrees],
  );

  return { analyzePoint };
}

function computeAnalysis(
  point: [number, number],
  buildings: Building[],
  trees: Tree[],
  currentTime: Date,
): PointAnalysisResult {
  const [lng, lat] = point;

  const times = getSunTimes(currentTime, lat, lng);
  const dayStart = new Date(times.sunrise);
  const dayEnd = new Date(times.sunset);

  const timeline: TimeSlot[] = [];
  const testPoint = turf.point([lng, lat]);
  const time = new Date(dayStart);

  const buildingInputs = buildings.map((b) => ({
    id: b.id, footprint: b.footprint, height: b.height,
  }));

  while (time <= dayEnd) {
    const sun = getSunPosition(time, lat, lng);

    let inSun = true;
    if (sun.altitude > 0.01) {
      // Check building shadows
      const shadows = calculateFullShadows(buildingInputs, sun.azimuth, sun.altitude, lat);

      for (const shadow of shadows) {
        try {
          const shadowPoly = turf.feature(shadow.geometry);
          if (turf.booleanPointInPolygon(testPoint, shadowPoly as GeoJSON.Feature<GeoJSON.Polygon>)) {
            inSun = false;
            break;
          }
        } catch {
          // Skip invalid geometry
        }
      }

      // Check tree shadows if still in sun
      if (inSun && trees.length > 0) {
        const treeShadows = calculateTreeShadows(trees, sun.azimuth, sun.altitude, lat, time);
        for (const shadow of treeShadows) {
          try {
            const shadowPoly = turf.feature(shadow.geometry);
            if (turf.booleanPointInPolygon(testPoint, shadowPoly as GeoJSON.Feature<GeoJSON.Polygon>)) {
              inSun = false;
              break;
            }
          } catch {
            // Skip invalid geometry
          }
        }
      }
    } else {
      inSun = false;
    }

    timeline.push({
      time: new Date(time),
      inSun,
      sunAltitude: sun.altitude,
      sunAzimuth: sun.azimuth,
    });

    time.setMinutes(time.getMinutes() + SIMULATION_INTERVAL_MIN);
  }

  // Derived metrics
  const sunSlots = timeline.filter((s) => s.inSun);
  const totalSunMinutes = sunSlots.length * SIMULATION_INTERVAL_MIN;

  const now = currentTime.getTime();
  const currentSlotIndex = timeline.findIndex(
    (s) => Math.abs(s.time.getTime() - now) < SIMULATION_INTERVAL_MIN * 60 * 1000,
  );
  const currentlyInSun = currentSlotIndex >= 0 ? timeline[currentSlotIndex].inSun : false;

  let remainingSunMinutes: number | null = null;
  if (currentlyInSun && currentSlotIndex >= 0) {
    let count = 0;
    for (let i = currentSlotIndex; i < timeline.length; i++) {
      if (!timeline[i].inSun) break;
      count++;
    }
    remainingSunMinutes = count * SIMULATION_INTERVAL_MIN;
  }

  let nextSunTime: Date | null = null;
  if (!currentlyInSun && currentSlotIndex >= 0) {
    for (let i = currentSlotIndex + 1; i < timeline.length; i++) {
      if (timeline[i].inSun) {
        nextSunTime = timeline[i].time;
        break;
      }
    }
  }

  const bestWindow = findBestSunWindow(timeline, SIMULATION_INTERVAL_MIN);
  const currentSun = getSunPosition(currentTime, lat, lng);

  return {
    location: point,
    currentlyInSun,
    remainingSunMinutes,
    nextSunTime,
    totalSunMinutesToday: totalSunMinutes,
    sunAngle: currentSun.altitudeDeg,
    timeline,
    bestSunWindow: bestWindow,
  };
}

function findBestSunWindow(
  timeline: TimeSlot[],
  intervalMin: number,
): { start: Date; end: Date } | null {
  let bestStart = 0;
  let bestLen = 0;
  let curStart = 0;
  let curLen = 0;

  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].inSun) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }

  if (bestLen === 0) return null;

  return {
    start: timeline[bestStart].time,
    end: new Date(
      timeline[bestStart].time.getTime() + bestLen * intervalMin * 60 * 1000,
    ),
  };
}
