import { useCallback } from "react";
import * as turf from "@turf/turf";
import type { Building } from "../types/building";
import type { PointAnalysisResult, TimeSlot } from "../types/analysis";
import { getSunPosition, getSunTimes } from "../lib/sun/position";
import { calculateFullShadows, calculateSimpleShadows } from "../lib/shadow/projection";
import { useAnalysisStore } from "../store/analysisStore";
import { useTimeStore } from "../store/timeStore";
import { fetchBuildingsFromOverpass } from "../lib/buildings/loader";

const SIMULATION_INTERVAL_MIN = 10;
/** Radius in degrees around the clicked point to fetch buildings (~300m) */
const ANALYSIS_RADIUS_DEG = 0.003;

/**
 * Hook that performs point-in-sun/shade analysis when the user clicks on the map.
 * Fetches buildings on-demand around the clicked point from Overpass API,
 * then simulates the entire day in 10-minute intervals.
 */
export function usePointAnalysis() {
  const setSelectedPoint = useAnalysisStore((s) => s.setSelectedPoint);
  const setAnalysisResult = useAnalysisStore((s) => s.setAnalysisResult);
  const setAnalyzing = useAnalysisStore((s) => s.setAnalyzing);
  const setAnalysisShadows = useAnalysisStore((s) => s.setAnalysisShadows);
  const setAnalysisBuildings = useAnalysisStore((s) => s.setAnalysisBuildings);
  const currentTime = useTimeStore((s) => s.currentTime);

  const analyzePoint = useCallback(
    async (lngLat: [number, number]) => {
      setSelectedPoint(lngLat);
      setAnalyzing(true);
      setAnalysisShadows([]);
      setAnalysisBuildings([]);

      try {
        const [lng, lat] = lngLat;

        // Fetch buildings around the clicked point
        const bbox: [number, number, number, number] = [
          lng - ANALYSIS_RADIUS_DEG,
          lat - ANALYSIS_RADIUS_DEG,
          lng + ANALYSIS_RADIUS_DEG,
          lat + ANALYSIS_RADIUS_DEG,
        ];
        const buildings = await fetchBuildingsFromOverpass(bbox);
        setAnalysisBuildings(buildings);

        // Compute analysis
        const result = computeAnalysis(lngLat, buildings, currentTime);
        setAnalysisResult(result);

        // Compute current shadows for map display using simple projection (no turf.union)
        const sun = getSunPosition(currentTime, lat, lng);
        if (sun.altitude > 0.01) {
          const buildingInputs = buildings.map((b) => ({
            id: b.id, footprint: b.footprint, height: b.height,
          }));
          const shadows = calculateSimpleShadows(buildingInputs, sun.azimuth, sun.altitude, lat);
          setAnalysisShadows(shadows);
        }
      } catch (err) {
        console.error("Point analysis error:", err);
        setAnalysisResult(null);
      } finally {
        setAnalyzing(false);
      }
    },
    [currentTime, setSelectedPoint, setAnalysisResult, setAnalyzing, setAnalysisShadows, setAnalysisBuildings],
  );

  return { analyzePoint };
}

function computeAnalysis(
  point: [number, number],
  buildings: Building[],
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
      // Use full shadows (including building footprint) for accurate point-in-polygon
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
