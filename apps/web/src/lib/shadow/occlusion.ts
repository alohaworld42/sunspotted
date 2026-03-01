import type { Polygon, MultiPolygon } from "geojson";
import * as turf from "@turf/turf";
import type { ShadowPolygon } from "../../types/shadow";

interface ShadowCaster {
  id: string;
  footprint: Polygon;
  height: number;
}

const METERS_PER_DEGREE_LAT = 111_320;

function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
}

function metersToDegreesLat(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

/**
 * Quick bounding box of a polygon/multipolygon geometry.
 */
function geomBBox(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings = geom.type === "Polygon"
    ? geom.coordinates
    : geom.coordinates.flat();

  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function bboxOverlaps(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function buildingBBox(b: ShadowCaster): [number, number, number, number] {
  return geomBBox(b.footprint);
}

/**
 * Clip ground shadows against all building footprints, and compute
 * height-adjusted continuation shadows when taller buildings cast
 * shadows past shorter ones.
 */
export function clipShadowsAgainstBuildings(
  shadows: ShadowPolygon[],
  buildings: ShadowCaster[],
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon[] {
  if (shadows.length === 0 || buildings.length === 0) return shadows;

  // Pre-compute building footprint features + bboxes
  const buildingData = buildings.map((b) => {
    try {
      return {
        id: b.id,
        height: b.height,
        bbox: buildingBBox(b),
        feature: turf.polygon(b.footprint.coordinates),
      };
    } catch {
      return null;
    }
  }).filter((d) => d !== null);

  // Build a height lookup
  const heightById = new Map<string, number>();
  for (const b of buildings) {
    heightById.set(b.id, b.height);
  }

  const sinAngle = Math.sin(sunAzimuth);
  const cosAngle = Math.cos(sunAzimuth);

  const result: ShadowPolygon[] = [];

  for (const shadow of shadows) {
    const casterHeight = heightById.get(shadow.buildingId) ?? 0;
    const shadowBBox = geomBBox(shadow.geometry);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = turf.feature(shadow.geometry);
    if (!current) continue;

    const continuations: ShadowPolygon[] = [];

    for (const bd of buildingData) {
      if (bd.id === shadow.buildingId) continue;
      if (!bboxOverlaps(shadowBBox, bd.bbox)) continue;

      try {
        // Check if this building's footprint actually intersects the shadow
        const intersection = turf.intersect(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turf.featureCollection([current, bd.feature]) as any,
        );
        if (!intersection) continue;

        // Clip the shadow against this building's footprint
        const clipped = turf.difference(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turf.featureCollection([current, bd.feature]) as any,
        );
        if (clipped) {
          current = clipped;
        }

        // If caster is taller, compute continuation shadow past this building
        if (casterHeight > bd.height && sunAltitude > 0.01) {
          const residualHeight = casterHeight - bd.height;
          const residualLength = residualHeight / Math.tan(sunAltitude);
          const dxDeg = metersToDegreesLng(residualLength * sinAngle, centerLat);
          const dyDeg = metersToDegreesLat(residualLength * cosAngle);

          try {
            // Project the intersection region forward at residual height
            const intCoords = intersection.geometry.type === "Polygon"
              ? intersection.geometry.coordinates[0]
              : intersection.geometry.coordinates[0][0];

            const projectedCoords = intCoords.map((c: number[]) => [c[0] + dxDeg, c[1] + dyDeg]);

            // Build continuation from hull of intersection + projected points
            const allPoints = turf.featureCollection([
              ...intCoords.map((c: number[]) => turf.point(c)),
              ...projectedCoords.map((c: number[]) => turf.point(c)),
            ]);
            const hull = turf.convex(allPoints);
            if (hull) {
              // Subtract the blocking building's footprint from continuation
              const groundCont = turf.difference(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                turf.featureCollection([hull, bd.feature]) as any,
              );
              if (groundCont) {
                continuations.push({
                  buildingId: shadow.buildingId,
                  geometry: groundCont.geometry as Polygon | MultiPolygon,
                });
              }
            }
          } catch {
            // Skip invalid continuation geometry
          }
        }
      } catch {
        // Skip on turf errors, keep current shadow
      }
    }

    if (current) {
      result.push({
        buildingId: shadow.buildingId,
        sourceType: shadow.sourceType,
        geometry: current.geometry as Polygon | MultiPolygon,
      });
    }

    result.push(...continuations);
  }

  return result;
}
