-- Community-contributed sun spots
CREATE TABLE IF NOT EXISTS sun_spots (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    name            VARCHAR(255),
    description     TEXT,
    location        GEOMETRY(Point, 4326) NOT NULL,
    category        VARCHAR(50),
    best_time_start TIME,
    best_time_end   TIME,
    best_months     SMALLINT[],
    rating          REAL DEFAULT 0,
    rating_count    INTEGER DEFAULT 0,
    photos          JSONB DEFAULT '[]',
    verified        BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sun_spots_location ON sun_spots USING GIST (location);
