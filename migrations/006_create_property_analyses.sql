-- Balcony / real estate sun analysis
CREATE TABLE IF NOT EXISTS property_analyses (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    name            VARCHAR(255),
    location        GEOMETRY(Point, 4326) NOT NULL,
    floor_level     SMALLINT DEFAULT 0,
    orientation     REAL,
    balcony_width   REAL,
    balcony_depth   REAL,
    yearly_sun_hours JSONB,
    analysis_result JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
