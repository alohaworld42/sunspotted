import type { Polygon, MultiPolygon } from "geojson";

export interface ShadowPolygon {
  buildingId: string;
  geometry: Polygon | MultiPolygon;
}

export interface ShadowCalculationInput {
  buildings: Array<{
    id: string;
    footprint: Polygon;
    height: number;
  }>;
  sunAzimuth: number;
  sunAltitude: number;
  centerLat: number;
}

export interface ShadowCalculationResult {
  shadows: ShadowPolygon[];
  computeTimeMs: number;
}
