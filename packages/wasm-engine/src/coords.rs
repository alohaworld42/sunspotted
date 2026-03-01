use std::f64::consts::PI;

pub const METERS_PER_DEGREE_LAT: f64 = 111_320.0;

/// Convert meters to degrees of longitude at a given latitude.
pub fn meters_to_deg_lng(meters: f64, lat: f64) -> f64 {
    meters / (METERS_PER_DEGREE_LAT * (lat * PI / 180.0).cos())
}

/// Convert meters to degrees of latitude.
pub fn meters_to_deg_lat(meters: f64) -> f64 {
    meters / METERS_PER_DEGREE_LAT
}
