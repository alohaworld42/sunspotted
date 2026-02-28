/** DACH region bounding box [minLng, minLat, maxLng, maxLat] */
export const DACH_BOUNDS = [5.87, 45.82, 17.16, 55.06] as const;

/** Default map center: Vienna Stephansplatz */
export const DEFAULT_CENTER = [16.3738, 48.2082] as const;

/** Default map zoom level */
export const DEFAULT_ZOOM = 15;

/** Tile zoom level used for building data partitioning */
export const TILE_ZOOM = 15;

/** Estimated height per building level in meters */
export const HEIGHT_PER_LEVEL = 3.0;

/** Shadow cache time slot interval in minutes */
export const SHADOW_CACHE_INTERVAL_MINUTES = 10;

/** Maximum number of buildings to render at once */
export const MAX_BUILDINGS_PER_VIEWPORT = 5000;

/** Sun altitude threshold below which we don't compute shadows (radians) */
export const MIN_SUN_ALTITUDE = 0.01;
