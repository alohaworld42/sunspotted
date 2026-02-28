-- POIs: cafes, restaurants, parks, beer gardens
CREATE TABLE IF NOT EXISTS pois (
    id              BIGSERIAL PRIMARY KEY,
    osm_id          BIGINT UNIQUE,
    name            VARCHAR(255),
    category        VARCHAR(50) NOT NULL,
    subcategory     VARCHAR(50),
    location        GEOMETRY(Point, 4326) NOT NULL,
    outdoor_area    GEOMETRY(Polygon, 4326),
    has_outdoor     BOOLEAN DEFAULT false,
    outdoor_seating VARCHAR(20),
    orientation     REAL,
    opening_hours   JSONB,
    tags            JSONB,
    address         JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pois_location ON pois USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois (category);
CREATE INDEX IF NOT EXISTS idx_pois_outdoor ON pois (has_outdoor) WHERE has_outdoor = true;
