-- Server-side precomputed shadow cache
CREATE TABLE IF NOT EXISTS shadow_cache (
    id              BIGSERIAL PRIMARY KEY,
    tile_x          INTEGER NOT NULL,
    tile_y          INTEGER NOT NULL,
    tile_z          SMALLINT NOT NULL DEFAULT 15,
    time_slot       TIMESTAMPTZ NOT NULL,
    shadow_geom     GEOMETRY(MultiPolygon, 4326),
    sun_azimuth     REAL NOT NULL,
    sun_altitude    REAL NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (tile_x, tile_y, tile_z, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_shadow_cache_tile_time
    ON shadow_cache (tile_z, tile_x, tile_y, time_slot);
