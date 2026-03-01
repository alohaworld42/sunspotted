import * as turf from "@turf/turf";
import type { POI, POISunScore } from "../../types/poi";
import { getSunPosition, getSunTimes } from "../sun/position";
import { calculateShadows } from "../shadow/projection";
import { BuildingSpatialIndex } from "../shadow/spatial-index";

const INTERVAL_MIN = 15;
const SEARCH_RADIUS_DEG = 0.006; // ~600m

/**
 * Calculate sun score for a single POI by simulating shadow state
 * at regular intervals through the day.
 */
export function calculatePOISunScore(
  poi: POI,
  currentTime: Date,
  spatialIndex: BuildingSpatialIndex,
): POISunScore {
  const [lng, lat] = poi.location;
  const testPoint = turf.point([lng, lat]);

  // Get nearby buildings
  const nearby = spatialIndex.search([
    lng - SEARCH_RADIUS_DEG,
    lat - SEARCH_RADIUS_DEG,
    lng + SEARCH_RADIUS_DEG,
    lat + SEARCH_RADIUS_DEG,
  ]);

  const times = getSunTimes(currentTime, lat, lng);
  const dayStart = new Date(times.sunrise);
  const dayEnd = new Date(times.sunset);

  // Simulate through the day
  const slots: { time: Date; inSun: boolean }[] = [];
  const time = new Date(dayStart);

  while (time <= dayEnd) {
    const sun = getSunPosition(time, lat, lng);
    let inSun = true;

    if (sun.altitude > 0.01) {
      const buildingInputs = nearby.map((b) => ({
        id: b.id,
        footprint: b.footprint,
        height: b.height,
      }));
      const shadows = calculateShadows(buildingInputs, sun.azimuth, sun.altitude, lat);

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

    slots.push({ time: new Date(time), inSun });
    time.setMinutes(time.getMinutes() + INTERVAL_MIN);
  }

  // Current status
  const now = currentTime.getTime();
  const currentSlot = slots.find(
    (s) => Math.abs(s.time.getTime() - now) < INTERVAL_MIN * 60 * 1000,
  );
  const currentlyInSun = currentSlot?.inSun ?? false;

  // Sun minutes in next hour
  const oneHourLater = now + 60 * 60 * 1000;
  const sunMinutesNextHour =
    slots.filter((s) => s.time.getTime() >= now && s.time.getTime() < oneHourLater && s.inSun)
      .length * INTERVAL_MIN;

  // Sun minutes in next 3 hours
  const threeHoursLater = now + 3 * 60 * 60 * 1000;
  const sunMinutesNext3Hours =
    slots.filter((s) => s.time.getTime() >= now && s.time.getTime() < threeHoursLater && s.inSun)
      .length * INTERVAL_MIN;

  // Total sun today
  const totalSunToday = slots.filter((s) => s.inSun).length * INTERVAL_MIN;

  // Best continuous sun window
  let bestStart = 0;
  let bestLen = 0;
  let curStart = 0;
  let curLen = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].inSun) {
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
  const bestSunWindow =
    bestLen > 0
      ? {
          start: slots[bestStart].time,
          end: new Date(slots[bestStart].time.getTime() + bestLen * INTERVAL_MIN * 60 * 1000),
        }
      : null;

  // Composite score (0-100): weighted by remaining sun + total + outdoor seating
  const remainingWeight = sunMinutesNext3Hours / 180; // 0-1
  const totalWeight = Math.min(totalSunToday / 480, 1); // 0-1 (8h max)
  const outdoorBonus = poi.hasOutdoor ? 0.1 : 0;
  const currentBonus = currentlyInSun ? 0.15 : 0;
  const score = Math.round(
    (remainingWeight * 0.4 + totalWeight * 0.35 + currentBonus + outdoorBonus) * 100,
  );

  return {
    poiId: poi.id,
    currentlyInSun,
    sunMinutesNextHour,
    sunMinutesNext3Hours,
    totalSunToday,
    bestSunWindow,
    score: Math.min(100, score),
  };
}
