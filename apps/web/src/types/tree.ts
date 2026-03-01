import type { Polygon } from "geojson";

export interface Tree {
  id: string;
  osmId?: number;
  location: [number, number]; // [lng, lat]
  height: number;             // meters (default 10)
  canopyRadius: number;       // meters (default 4)
  canopyFootprint: Polygon;   // circular polygon (12-sided)
  leafCycle?: "deciduous" | "evergreen";
}
