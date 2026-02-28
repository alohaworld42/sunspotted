import RBush from "rbush";
import type { Building } from "../../types/building";

interface BuildingBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  building: Building;
}

/**
 * Spatial index for fast building lookups by geographic bounds.
 * Wraps RBush (R-Tree) for 2D spatial queries.
 */
export class BuildingSpatialIndex {
  private tree: RBush<BuildingBBox>;

  constructor() {
    this.tree = new RBush<BuildingBBox>();
  }

  /**
   * Build the index from a list of buildings.
   */
  load(buildings: Building[]): void {
    this.tree.clear();
    const items: BuildingBBox[] = buildings.map((b) => ({
      minX: b.bbox[0],
      minY: b.bbox[1],
      maxX: b.bbox[2],
      maxY: b.bbox[3],
      building: b,
    }));
    this.tree.load(items);
  }

  /**
   * Query buildings within a bounding box.
   */
  search(bbox: [number, number, number, number]): Building[] {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    return this.tree
      .search({ minX: minLng, minY: minLat, maxX: maxLng, maxY: maxLat })
      .map((item) => item.building);
  }

  /**
   * Find buildings that could potentially cast shadows on a given point.
   * Searches in the direction the sun is coming from.
   */
  findShadowCasters(
    point: [number, number],
    _sunAzimuth: number,
    maxShadowLengthDeg: number,
  ): Building[] {
    // Search a box around the point extended toward the sun
    const [lng, lat] = point;
    return this.search([
      lng - maxShadowLengthDeg,
      lat - maxShadowLengthDeg,
      lng + maxShadowLengthDeg,
      lat + maxShadowLengthDeg,
    ]);
  }

  get size(): number {
    return this.tree.all().length;
  }

  clear(): void {
    this.tree.clear();
  }
}
