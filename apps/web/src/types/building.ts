import type { Feature, Polygon } from "geojson";

export interface Building {
  id: string;
  osmId?: number;
  footprint: Polygon;
  height: number;
  levels?: number;
  heightSource: "osm" | "estimated" | "lidar";
  centroid: [number, number];
  bbox: [number, number, number, number];
}

export type BuildingFeature = Feature<Polygon, {
  id: string;
  height: number;
  levels?: number;
  heightSource: string;
}>;
