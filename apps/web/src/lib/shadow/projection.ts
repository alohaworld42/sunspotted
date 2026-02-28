import type { Polygon } from "geojson";
import * as turf from "@turf/turf";
import type { ShadowPolygon } from "../../types/shadow";

const METERS_PER_DEGREE_LAT = 111_320;

function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
}

function metersToDegreesLat(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

/**
 * Project a single building's shadow onto the ground plane.
 *
 * @param footprint - Building footprint polygon (GeoJSON)
 * @param height - Building height in meters
 * @param sunAzimuth - Sun azimuth in radians (from south, clockwise) as returned by suncalc
 * @param sunAltitude - Sun altitude in radians above horizon
 * @param centerLat - Latitude for meter-to-degree conversion
 * @returns Shadow polygon or null if sun is below horizon
 */
export function projectBuildingShadow(
  id: string,
  footprint: Polygon,
  height: number,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon | null {
  // No shadow when sun is below horizon or directly overhead
  if (sunAltitude <= 0.01) return null;

  const shadowLength = height / Math.tan(sunAltitude);

  // suncalc azimuth: 0 = south, positive = west (clockwise from south)
  // Using bearing formula (dx=sin, dy=cos) with suncalc azimuth directly
  // gives the shadow direction: az=0 (south) → dy=+1 (north) = correct
  const angle = sunAzimuth;
  const dxMeters = shadowLength * Math.sin(angle);
  const dyMeters = shadowLength * Math.cos(angle);

  const dxDeg = metersToDegreesLng(dxMeters, centerLat);
  const dyDeg = metersToDegreesLat(dyMeters);

  const coords = footprint.coordinates[0];
  const shadowCoords = coords.map((coord) => [coord[0] + dxDeg, coord[1] + dyDeg]);

  try {
    const footprintFeature = turf.polygon([coords]);
    const shadowFeature = turf.polygon([shadowCoords]);

    // Union footprint + projected shadow, then subtract the building itself
    // so only the shadow on the ground (streets, etc.) is shown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const union = turf.union(turf.featureCollection([footprintFeature, shadowFeature]) as any);
    if (!union) return null;

    const groundShadow = turf.difference(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      turf.featureCollection([union, footprintFeature]) as any,
    );
    if (!groundShadow) return null;

    return {
      buildingId: id,
      geometry: groundShadow.geometry as Polygon,
    };
  } catch {
    // Fallback: just the projected polygon (minus building area may fail)
    try {
      return {
        buildingId: id,
        geometry: turf.polygon([shadowCoords]).geometry,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Calculate ground-only shadows (building footprint subtracted) for map rendering.
 */
export function calculateShadows(
  buildings: Array<{ id: string; footprint: Polygon; height: number }>,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon[] {
  if (sunAltitude <= 0.01) return [];

  const shadows: ShadowPolygon[] = [];

  for (const building of buildings) {
    const shadow = projectBuildingShadow(
      building.id,
      building.footprint,
      building.height,
      sunAzimuth,
      sunAltitude,
      centerLat,
    );
    if (shadow) shadows.push(shadow);
  }

  return shadows;
}

/**
 * Calculate full shadow areas (including building footprint) for point-in-polygon analysis.
 * Uses a simple convex hull approach: combine footprint + projected vertices into one polygon.
 * This avoids turf.union which silently fails on many real-world geometries.
 */
export function calculateFullShadows(
  buildings: Array<{ id: string; footprint: Polygon; height: number }>,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon[] {
  if (sunAltitude <= 0.01) return [];

  const shadows: ShadowPolygon[] = [];
  const angle = sunAzimuth;
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);

  for (const building of buildings) {
    const shadowLength = building.height / Math.tan(sunAltitude);
    const dxDeg = metersToDegreesLng(shadowLength * sinAngle, centerLat);
    const dyDeg = metersToDegreesLat(shadowLength * cosAngle);

    const coords = building.footprint.coordinates[0];
    const shadowCoords = coords.map((c) => [c[0] + dxDeg, c[1] + dyDeg]);

    try {
      // Combine all original + projected points and compute convex hull
      // This gives us the full shadow envelope without turf.union
      const allPoints = turf.featureCollection([
        ...coords.map((c) => turf.point(c)),
        ...shadowCoords.map((c) => turf.point(c)),
      ]);
      const hull = turf.convex(allPoints);
      if (hull) {
        shadows.push({ buildingId: building.id, geometry: hull.geometry as Polygon });
      }
    } catch {
      // Fallback: just use the projected shadow polygon directly
      try {
        shadows.push({
          buildingId: building.id,
          geometry: { type: "Polygon", coordinates: [shadowCoords] },
        });
      } catch {
        // Skip completely invalid geometry
      }
    }
  }

  return shadows;
}

/**
 * Calculate shadow polygons for map rendering.
 * Uses convex hull for clean shapes, then subtracts building footprint
 * so shadows only appear on the ground (streets, sidewalks, etc.).
 */
export function calculateSimpleShadows(
  buildings: Array<{ id: string; footprint: Polygon; height: number }>,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon[] {
  if (sunAltitude <= 0.01) return [];

  const shadows: ShadowPolygon[] = [];
  const angle = sunAzimuth;
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);

  for (const building of buildings) {
    const shadowLength = building.height / Math.tan(sunAltitude);
    const dxDeg = metersToDegreesLng(shadowLength * sinAngle, centerLat);
    const dyDeg = metersToDegreesLat(shadowLength * cosAngle);

    const coords = building.footprint.coordinates[0];
    const shadowCoords = coords.map((c) => [c[0] + dxDeg, c[1] + dyDeg]);

    try {
      // Step 1: Convex hull of footprint + shadow = clean shadow envelope
      const allPoints = turf.featureCollection([
        ...coords.map((c) => turf.point(c)),
        ...shadowCoords.map((c) => turf.point(c)),
      ]);
      const hull = turf.convex(allPoints);
      if (!hull) continue;

      // Step 2: Subtract building footprint → shadow only on ground
      try {
        const footprintPoly = turf.polygon([coords]);
        const groundShadow = turf.difference(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turf.featureCollection([hull, footprintPoly]) as any,
        );
        if (groundShadow) {
          shadows.push({
            buildingId: building.id,
            geometry: groundShadow.geometry as Polygon,
          });
          continue;
        }
      } catch {
        // difference failed — fall through to hull
      }

      // Fallback: use hull as-is (includes building area)
      shadows.push({
        buildingId: building.id,
        geometry: hull.geometry as Polygon,
      });
    } catch {
      // Last resort: just the offset polygon
      try {
        const offsetPoly = turf.polygon([shadowCoords]);
        shadows.push({
          buildingId: building.id,
          geometry: offsetPoly.geometry,
        });
      } catch {
        // Skip invalid geometry
      }
    }
  }

  return shadows;
}
