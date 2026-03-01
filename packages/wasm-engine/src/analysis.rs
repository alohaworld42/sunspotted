use crate::geometry::point_in_polygon;
use crate::shadow::{calculate_building_shadows, calculate_tree_shadows};
use crate::sun::{sun_position, sun_times};
use crate::types::{AnalysisResult, Building, Point, TimeSlotOutput, Tree};

const SIMULATION_INTERVAL_MIN: f64 = 10.0;
const INTERVAL_MS: f64 = SIMULATION_INTERVAL_MIN * 60.0 * 1000.0;

/// Run the full-day analysis loop entirely in WASM.
/// This is the hot path — no JS round-trips during the loop.
pub fn analyze_point(
    point_lng: f64,
    point_lat: f64,
    buildings: &[Building],
    trees: &[Tree],
    current_time_ms: f64,
) -> AnalysisResult {
    let test_point = Point {
        x: point_lng,
        y: point_lat,
    };

    // Get sunrise/sunset for the current day
    let (sunrise_ms, sunset_ms) = sun_times(current_time_ms, point_lat, point_lng);

    // Extract month for seasonal tree adjustments
    let month = ms_to_month(current_time_ms);

    // Build timeline by iterating from sunrise to sunset
    let mut timeline: Vec<TimeSlotOutput> = Vec::new();
    let mut time_ms = sunrise_ms;

    while time_ms <= sunset_ms {
        let (sun_az, sun_alt) = sun_position(time_ms, point_lat, point_lng);

        let in_sun = if sun_alt > 0.01 {
            // Check building shadows
            let building_shadows =
                calculate_building_shadows(buildings, sun_az, sun_alt, point_lat);
            let mut shaded = false;
            for (_id, shadow) in &building_shadows {
                if point_in_polygon(&test_point, shadow) {
                    shaded = true;
                    break;
                }
            }

            // Check tree shadows if not already shaded
            if !shaded && !trees.is_empty() {
                let tree_shadows =
                    calculate_tree_shadows(trees, sun_az, sun_alt, point_lat, month);
                for (_id, shadow) in &tree_shadows {
                    if point_in_polygon(&test_point, shadow) {
                        shaded = true;
                        break;
                    }
                }
            }

            !shaded
        } else {
            false
        };

        timeline.push(TimeSlotOutput {
            time_ms,
            in_sun,
            sun_altitude: sun_alt,
            sun_azimuth: sun_az,
        });

        time_ms += INTERVAL_MS;
    }

    // Compute derived metrics
    let sun_slot_count = timeline.iter().filter(|s| s.in_sun).count();
    let total_sun_minutes = sun_slot_count as f64 * SIMULATION_INTERVAL_MIN;

    // Find current slot
    let current_slot_index = timeline
        .iter()
        .position(|s| (s.time_ms - current_time_ms).abs() < INTERVAL_MS);

    let currently_in_sun = current_slot_index
        .map(|i| timeline[i].in_sun)
        .unwrap_or(false);

    // Remaining sun minutes (consecutive sun slots from current)
    let remaining_sun_minutes = if currently_in_sun {
        current_slot_index.map(|idx| {
            let mut count = 0u32;
            for i in idx..timeline.len() {
                if !timeline[i].in_sun {
                    break;
                }
                count += 1;
            }
            count as f64 * SIMULATION_INTERVAL_MIN
        })
    } else {
        None
    };

    // Next sun time (first sun slot after current)
    let next_sun_time_ms = if !currently_in_sun {
        current_slot_index.and_then(|idx| {
            for i in (idx + 1)..timeline.len() {
                if timeline[i].in_sun {
                    return Some(timeline[i].time_ms);
                }
            }
            None
        })
    } else {
        None
    };

    // Best sun window (longest contiguous run of sun slots)
    let (best_start_ms, best_end_ms) = find_best_sun_window(&timeline);

    // Current sun angle
    let (_, current_alt) = sun_position(current_time_ms, point_lat, point_lng);
    let sun_angle = current_alt * 180.0 / std::f64::consts::PI;

    AnalysisResult {
        timeline,
        total_sun_minutes,
        currently_in_sun,
        remaining_sun_minutes,
        next_sun_time_ms,
        best_window_start_ms: best_start_ms,
        best_window_end_ms: best_end_ms,
        sun_angle,
    }
}

fn find_best_sun_window(timeline: &[TimeSlotOutput]) -> (Option<f64>, Option<f64>) {
    let mut best_start = 0usize;
    let mut best_len = 0usize;
    let mut cur_start = 0usize;
    let mut cur_len = 0usize;

    for i in 0..timeline.len() {
        if timeline[i].in_sun {
            if cur_len == 0 {
                cur_start = i;
            }
            cur_len += 1;
            if cur_len > best_len {
                best_len = cur_len;
                best_start = cur_start;
            }
        } else {
            cur_len = 0;
        }
    }

    if best_len == 0 {
        return (None, None);
    }

    let start_ms = timeline[best_start].time_ms;
    let end_ms = start_ms + (best_len as f64) * INTERVAL_MS;
    (Some(start_ms), Some(end_ms))
}

/// Extract month (1-12) from a millisecond timestamp.
fn ms_to_month(timestamp_ms: f64) -> u32 {
    // Convert ms since epoch to approximate month
    // Days since epoch
    let days = (timestamp_ms / 86_400_000.0).floor() as i64;
    // Approximate date calculation
    let (_, month, _) = days_to_date(days);
    month
}

/// Convert days since Unix epoch to (year, month, day).
/// Uses a civil calendar algorithm.
fn days_to_date(days_since_epoch: i64) -> (i32, u32, u32) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y } as i32;
    (year, m, d)
}
