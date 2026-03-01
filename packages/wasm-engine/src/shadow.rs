use crate::coords::{meters_to_deg_lat, meters_to_deg_lng};
use crate::geometry::{convex_hull, create_circle};
use crate::types::{Building, Point, Polygon, Tree};

/// Project a building's shadow as a convex hull of footprint + projected vertices.
/// Returns the full shadow envelope (including building footprint area).
///
/// Sun azimuth: 0 = south, positive = west (clockwise) — matches suncalc convention.
/// Sun altitude: radians above horizon.
pub fn project_building_shadow(
    building: &Building,
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
) -> Option<Polygon> {
    if sun_altitude <= 0.01 {
        return None;
    }

    let shadow_length = building.height / sun_altitude.tan();
    let sin_angle = sun_azimuth.sin();
    let cos_angle = sun_azimuth.cos();

    let dx_deg = meters_to_deg_lng(shadow_length * sin_angle, center_lat);
    let dy_deg = meters_to_deg_lat(shadow_length * cos_angle);

    let footprint = &building.footprint.vertices;

    // Collect all original + projected points
    let mut all_points: Vec<Point> = Vec::with_capacity(footprint.len() * 2);
    for v in footprint {
        all_points.push(v.clone());
        all_points.push(Point {
            x: v.x + dx_deg,
            y: v.y + dy_deg,
        });
    }

    let hull = convex_hull(&all_points);
    if hull.vertices.len() >= 3 {
        Some(hull)
    } else {
        None
    }
}

/// Project a tree's shadow using its canopy as a circular polygon.
/// Applies seasonal adjustment for deciduous trees.
pub fn project_tree_shadow(
    tree: &Tree,
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
    month: u32,
) -> Option<Polygon> {
    if sun_altitude <= 0.01 {
        return None;
    }

    // Seasonal canopy adjustment
    let radius = effective_canopy_radius(tree.canopy_radius, tree.is_deciduous, month);
    let canopy = create_circle(&tree.location, radius, 12);

    let shadow_length = tree.height / sun_altitude.tan();
    let sin_angle = sun_azimuth.sin();
    let cos_angle = sun_azimuth.cos();

    let dx_deg = meters_to_deg_lng(shadow_length * sin_angle, center_lat);
    let dy_deg = meters_to_deg_lat(shadow_length * cos_angle);

    let mut all_points: Vec<Point> = Vec::with_capacity(canopy.vertices.len() * 2);
    for v in &canopy.vertices {
        all_points.push(v.clone());
        all_points.push(Point {
            x: v.x + dx_deg,
            y: v.y + dy_deg,
        });
    }

    let hull = convex_hull(&all_points);
    if hull.vertices.len() >= 3 {
        Some(hull)
    } else {
        None
    }
}

/// Deciduous trees lose 70% of their canopy radius in November through February.
fn effective_canopy_radius(base_radius: f64, is_deciduous: bool, month: u32) -> f64 {
    if is_deciduous && (month >= 11 || month <= 2) {
        base_radius * 0.3
    } else {
        base_radius
    }
}

/// Calculate all building shadows for a given sun position.
pub fn calculate_building_shadows(
    buildings: &[Building],
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
) -> Vec<(String, Polygon)> {
    if sun_altitude <= 0.01 {
        return Vec::new();
    }

    let mut shadows = Vec::with_capacity(buildings.len());
    for building in buildings {
        if let Some(shadow) = project_building_shadow(building, sun_azimuth, sun_altitude, center_lat) {
            shadows.push((building.id.clone(), shadow));
        }
    }
    shadows
}

/// Calculate all tree shadows for a given sun position.
pub fn calculate_tree_shadows(
    trees: &[Tree],
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
    month: u32,
) -> Vec<(String, Polygon)> {
    if sun_altitude <= 0.01 {
        return Vec::new();
    }

    let mut shadows = Vec::with_capacity(trees.len());
    for tree in trees {
        if let Some(shadow) = project_tree_shadow(tree, sun_azimuth, sun_altitude, center_lat, month) {
            shadows.push((tree.id.clone(), shadow));
        }
    }
    shadows
}
