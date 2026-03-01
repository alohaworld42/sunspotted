mod analysis;
mod coords;
mod geometry;
mod shadow;
mod sun;
mod types;

use types::{BuildingInput, ShadowOutput, TreeInput};
use wasm_bindgen::prelude::*;

/// Run the full-day point analysis entirely in WASM.
/// This is the main performance-critical function — replaces computeAnalysis in JS.
#[wasm_bindgen]
pub fn analyze_point(
    point_lng: f64,
    point_lat: f64,
    buildings_js: JsValue,
    trees_js: JsValue,
    timestamp_ms: f64,
) -> Result<JsValue, JsValue> {
    let building_inputs: Vec<BuildingInput> =
        serde_wasm_bindgen::from_value(buildings_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let tree_inputs: Vec<TreeInput> =
        serde_wasm_bindgen::from_value(trees_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let buildings: Vec<_> = building_inputs.iter().map(|b| b.to_building()).collect();
    let trees: Vec<_> = tree_inputs.iter().map(|t| t.to_tree()).collect();

    let result = analysis::analyze_point(point_lng, point_lat, &buildings, &trees, timestamp_ms);

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Calculate building shadows for map rendering at a specific sun position.
#[wasm_bindgen]
pub fn calculate_shadows(
    buildings_js: JsValue,
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
) -> Result<JsValue, JsValue> {
    let building_inputs: Vec<BuildingInput> =
        serde_wasm_bindgen::from_value(buildings_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let buildings: Vec<_> = building_inputs.iter().map(|b| b.to_building()).collect();

    let shadows = shadow::calculate_building_shadows(&buildings, sun_azimuth, sun_altitude, center_lat);

    let outputs: Vec<ShadowOutput> = shadows
        .into_iter()
        .map(|(id, polygon)| ShadowOutput {
            building_id: id,
            source_type: "building".to_string(),
            coordinates: polygon_to_geojson_coords(&polygon),
        })
        .collect();

    serde_wasm_bindgen::to_value(&outputs).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Calculate tree shadows for map rendering at a specific sun position.
#[wasm_bindgen]
pub fn calculate_tree_shadows(
    trees_js: JsValue,
    sun_azimuth: f64,
    sun_altitude: f64,
    center_lat: f64,
    month: u32,
) -> Result<JsValue, JsValue> {
    let tree_inputs: Vec<TreeInput> =
        serde_wasm_bindgen::from_value(trees_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let trees: Vec<_> = tree_inputs.iter().map(|t| t.to_tree()).collect();

    let shadows = shadow::calculate_tree_shadows(&trees, sun_azimuth, sun_altitude, center_lat, month);

    let outputs: Vec<ShadowOutput> = shadows
        .into_iter()
        .map(|(id, polygon)| ShadowOutput {
            building_id: id,
            source_type: "tree".to_string(),
            coordinates: polygon_to_geojson_coords(&polygon),
        })
        .collect();

    serde_wasm_bindgen::to_value(&outputs).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Get sun position (azimuth, altitude in radians).
#[wasm_bindgen]
pub fn get_sun_position(timestamp_ms: f64, lat: f64, lng: f64) -> Vec<f64> {
    let (az, alt) = sun::sun_position(timestamp_ms, lat, lng);
    vec![az, alt]
}

/// Get sunrise/sunset timestamps in ms.
#[wasm_bindgen]
pub fn get_sun_times(timestamp_ms: f64, lat: f64, lng: f64) -> Vec<f64> {
    let (rise, set) = sun::sun_times(timestamp_ms, lat, lng);
    vec![rise, set]
}

fn polygon_to_geojson_coords(polygon: &types::Polygon) -> Vec<Vec<[f64; 2]>> {
    let ring: Vec<[f64; 2]> = polygon
        .vertices
        .iter()
        .map(|p| [p.x, p.y])
        .collect();
    vec![ring]
}
