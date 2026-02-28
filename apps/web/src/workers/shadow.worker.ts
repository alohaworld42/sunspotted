/// <reference lib="webworker" />

import type { Polygon } from "geojson";
import * as turf from "@turf/turf";

interface ShadowRequest {
  type: "calculate";
  buildings: Array<{
    id: string;
    footprint: Polygon;
    height: number;
  }>;
  sunAzimuth: number;
  sunAltitude: number;
  centerLat: number;
}

interface ShadowResponse {
  type: "result";
  shadows: Array<{
    buildingId: string;
    geometry: Polygon;
  }>;
  computeTimeMs: number;
}

const METERS_PER_DEGREE_LAT = 111_320;

self.onmessage = (event: MessageEvent<ShadowRequest>) => {
  const { buildings, sunAzimuth, sunAltitude, centerLat } = event.data;

  const t0 = performance.now();

  if (sunAltitude <= 0.01) {
    const response: ShadowResponse = {
      type: "result",
      shadows: [],
      computeTimeMs: performance.now() - t0,
    };
    self.postMessage(response);
    return;
  }

  const shadowLength = 1 / Math.tan(sunAltitude);
  const angle = sunAzimuth;
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180);

  const shadows: ShadowResponse["shadows"] = [];

  for (const building of buildings) {
    const dxMeters = building.height * shadowLength * sinAngle;
    const dyMeters = building.height * shadowLength * cosAngle;
    const dxDeg = dxMeters / lngScale;
    const dyDeg = dyMeters / METERS_PER_DEGREE_LAT;

    const coords = building.footprint.coordinates[0];
    const shadowCoords = coords.map((coord) => [coord[0] + dxDeg, coord[1] + dyDeg]);

    try {
      const footprintFeature = turf.polygon([coords]);
      const shadowFeature = turf.polygon([shadowCoords]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const union = turf.union(turf.featureCollection([footprintFeature, shadowFeature]) as any);

      if (union) {
        // Subtract building footprint so shadow only shows on ground/streets
        const groundShadow = turf.difference(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turf.featureCollection([union, footprintFeature]) as any,
        );
        if (groundShadow) {
          shadows.push({
            buildingId: building.id,
            geometry: groundShadow.geometry as Polygon,
          });
        }
      }
    } catch {
      // Skip invalid geometry
    }
  }

  const response: ShadowResponse = {
    type: "result",
    shadows,
    computeTimeMs: performance.now() - t0,
  };
  self.postMessage(response);
};
