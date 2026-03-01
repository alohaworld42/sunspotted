import type { Building } from "../../types/building";
import type { Tree } from "../../types/tree";
import type { PointAnalysisResult, TimeSlot } from "../../types/analysis";
import type { ShadowPolygon } from "../../types/shadow";

// WASM module — loaded asynchronously
let wasmModule: typeof import("@sunspotted/wasm-engine") | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the WASM module. Non-blocking — call on app startup.
 */
export function initWasm(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      wasmModule = await import("@sunspotted/wasm-engine");
      console.log("[WASM] Engine loaded successfully");
    } catch (e) {
      console.warn("[WASM] Failed to load, using JS fallback:", e);
      wasmModule = null;
    }
  })();

  return initPromise;
}

/**
 * Check if WASM engine is loaded and ready.
 */
export function isWasmReady(): boolean {
  return wasmModule !== null;
}

interface BuildingInput {
  id: string;
  footprint: number[][];
  height: number;
}

interface TreeInput {
  id: string;
  location: [number, number];
  height: number;
  canopy_radius: number;
  is_deciduous: boolean;
}

interface WasmAnalysisResult {
  timeline: Array<{
    time_ms: number;
    in_sun: boolean;
    sun_altitude: number;
    sun_azimuth: number;
  }>;
  total_sun_minutes: number;
  currently_in_sun: boolean;
  remaining_sun_minutes: number | null;
  next_sun_time_ms: number | null;
  best_window_start_ms: number | null;
  best_window_end_ms: number | null;
  sun_angle: number;
}

interface WasmShadowOutput {
  building_id: string;
  source_type: string;
  coordinates: number[][][];
}

function buildingsToWasmInput(buildings: Building[]): BuildingInput[] {
  return buildings.map((b) => ({
    id: b.id,
    footprint: b.footprint.coordinates[0].map((c) => [c[0], c[1]]),
    height: b.height,
  }));
}

function treesToWasmInput(trees: Tree[]): TreeInput[] {
  return trees.map((t) => ({
    id: t.id,
    location: t.location,
    height: t.height,
    canopy_radius: t.canopyRadius,
    is_deciduous: t.leafCycle === "deciduous",
  }));
}

/**
 * Run the full-day analysis using WASM.
 * Returns null if WASM is not available (caller should use JS fallback).
 */
export function analyzePointWasm(
  point: [number, number],
  buildings: Building[],
  trees: Tree[],
  currentTime: Date,
): PointAnalysisResult | null {
  if (!wasmModule) return null;

  const t0 = performance.now();

  try {
    const result: WasmAnalysisResult = wasmModule.analyze_point(
      point[0], // lng
      point[1], // lat
      buildingsToWasmInput(buildings),
      treesToWasmInput(trees),
      currentTime.getTime(),
    );

    const t1 = performance.now();
    console.log(
      `[WASM] analyze_point: ${(t1 - t0).toFixed(1)}ms (${buildings.length} buildings, ${trees.length} trees)`,
    );

    // Convert WASM result to PointAnalysisResult
    const timeline: TimeSlot[] = result.timeline.map((slot) => ({
      time: new Date(slot.time_ms),
      inSun: slot.in_sun,
      sunAltitude: slot.sun_altitude,
      sunAzimuth: slot.sun_azimuth,
    }));

    return {
      location: point,
      currentlyInSun: result.currently_in_sun,
      remainingSunMinutes: result.remaining_sun_minutes,
      nextSunTime: result.next_sun_time_ms != null ? new Date(result.next_sun_time_ms) : null,
      totalSunMinutesToday: result.total_sun_minutes,
      sunAngle: result.sun_angle,
      timeline,
      bestSunWindow:
        result.best_window_start_ms != null && result.best_window_end_ms != null
          ? {
              start: new Date(result.best_window_start_ms),
              end: new Date(result.best_window_end_ms),
            }
          : null,
    };
  } catch (e) {
    console.error("[WASM] analyze_point failed, will use JS fallback:", e);
    return null;
  }
}

/**
 * Calculate building shadows using WASM for map rendering.
 * Returns null if WASM is not available.
 */
export function calculateShadowsWasm(
  buildings: Building[],
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): ShadowPolygon[] | null {
  if (!wasmModule) return null;

  try {
    const shadows: WasmShadowOutput[] = wasmModule.calculate_shadows(
      buildingsToWasmInput(buildings),
      sunAzimuth,
      sunAltitude,
      centerLat,
    );

    return shadows.map((s) => ({
      buildingId: s.building_id,
      sourceType: s.source_type as "building" | "tree",
      geometry: {
        type: "Polygon" as const,
        coordinates: s.coordinates,
      },
    }));
  } catch (e) {
    console.error("[WASM] calculate_shadows failed:", e);
    return null;
  }
}

/**
 * Calculate tree shadows using WASM for map rendering.
 * Returns null if WASM is not available.
 */
export function calculateTreeShadowsWasm(
  trees: Tree[],
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
  month: number,
): ShadowPolygon[] | null {
  if (!wasmModule) return null;

  try {
    const shadows: WasmShadowOutput[] = wasmModule.calculate_tree_shadows(
      treesToWasmInput(trees),
      sunAzimuth,
      sunAltitude,
      centerLat,
      month,
    );

    return shadows.map((s) => ({
      buildingId: s.building_id,
      sourceType: "tree" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: s.coordinates,
      },
    }));
  } catch (e) {
    console.error("[WASM] calculate_tree_shadows failed:", e);
    return null;
  }
}
