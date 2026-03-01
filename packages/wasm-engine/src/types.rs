use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct Point {
    pub x: f64, // longitude
    pub y: f64, // latitude
}

#[derive(Clone, Debug)]
pub struct Polygon {
    pub vertices: Vec<Point>,
    pub bbox: [f64; 4], // [min_x, min_y, max_x, max_y]
}

impl Polygon {
    pub fn new(vertices: Vec<Point>) -> Self {
        let bbox = compute_bbox(&vertices);
        Polygon { vertices, bbox }
    }
}

fn compute_bbox(points: &[Point]) -> [f64; 4] {
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for p in points {
        if p.x < min_x { min_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        if p.x > max_x { max_x = p.x; }
        if p.y > max_y { max_y = p.y; }
    }
    [min_x, min_y, max_x, max_y]
}

#[derive(Clone, Debug)]
pub struct Building {
    pub id: String,
    pub footprint: Polygon,
    pub height: f64,
}

#[derive(Clone, Debug)]
pub struct Tree {
    pub id: String,
    pub location: Point,
    pub height: f64,
    pub canopy_radius: f64,
    pub is_deciduous: bool,
}

/// Input from JS via serde
#[derive(Deserialize)]
pub struct BuildingInput {
    pub id: String,
    pub footprint: Vec<Vec<f64>>, // [[lng, lat], ...]
    pub height: f64,
}

/// Input from JS via serde
#[derive(Deserialize)]
pub struct TreeInput {
    pub id: String,
    pub location: [f64; 2], // [lng, lat]
    pub height: f64,
    pub canopy_radius: f64,
    pub is_deciduous: bool,
}

/// Timeline slot returned to JS
#[derive(Serialize)]
pub struct TimeSlotOutput {
    pub time_ms: f64,
    pub in_sun: bool,
    pub sun_altitude: f64,
    pub sun_azimuth: f64,
}

/// Full analysis result returned to JS
#[derive(Serialize)]
pub struct AnalysisResult {
    pub timeline: Vec<TimeSlotOutput>,
    pub total_sun_minutes: f64,
    pub currently_in_sun: bool,
    pub remaining_sun_minutes: Option<f64>,
    pub next_sun_time_ms: Option<f64>,
    pub best_window_start_ms: Option<f64>,
    pub best_window_end_ms: Option<f64>,
    pub sun_angle: f64,
}

/// Shadow polygon output returned to JS (GeoJSON-compatible coords)
#[derive(Serialize)]
pub struct ShadowOutput {
    pub building_id: String,
    pub source_type: String,
    pub coordinates: Vec<Vec<[f64; 2]>>, // GeoJSON polygon coords
}

impl BuildingInput {
    pub fn to_building(&self) -> Building {
        let vertices: Vec<Point> = self
            .footprint
            .iter()
            .map(|c| Point { x: c[0], y: c[1] })
            .collect();
        Building {
            id: self.id.clone(),
            footprint: Polygon::new(vertices),
            height: self.height,
        }
    }
}

impl TreeInput {
    pub fn to_tree(&self) -> Tree {
        Tree {
            id: self.id.clone(),
            location: Point {
                x: self.location[0],
                y: self.location[1],
            },
            height: self.height,
            canopy_radius: self.canopy_radius,
            is_deciduous: self.is_deciduous,
        }
    }
}
