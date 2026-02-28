-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Buildings table: stores OSM building footprints with heights
CREATE TABLE IF NOT EXISTS buildings (
    id              BIGSERIAL PRIMARY KEY,
    osm_id          BIGINT UNIQUE NOT NULL,
    footprint       GEOMETRY(Polygon, 4326) NOT NULL,
    height          REAL,
    height_source   VARCHAR(20) DEFAULT 'estimated',
    levels          SMALLINT,
    roof_shape      VARCHAR(30),
    building_type   VARCHAR(50),
    min_height      REAL DEFAULT 0,
    tile_x          INTEGER NOT NULL,
    tile_y          INTEGER NOT NULL,
    tile_z          SMALLINT NOT NULL DEFAULT 15,
    centroid        GEOMETRY(Point, 4326),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buildings_footprint ON buildings USING GIST (footprint);
CREATE INDEX IF NOT EXISTS idx_buildings_tile ON buildings (tile_z, tile_x, tile_y);
CREATE INDEX IF NOT EXISTS idx_buildings_osm_id ON buildings (osm_id);
