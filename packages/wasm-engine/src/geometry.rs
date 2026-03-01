use crate::coords::{meters_to_deg_lat, meters_to_deg_lng};
use crate::types::{Point, Polygon};
use std::f64::consts::PI;

/// Andrew's monotone chain convex hull algorithm — O(n log n).
pub fn convex_hull(points: &[Point]) -> Polygon {
    let n = points.len();
    if n < 3 {
        return Polygon::new(points.to_vec());
    }

    let mut sorted: Vec<&Point> = points.iter().collect();
    sorted.sort_by(|a, b| {
        a.x.partial_cmp(&b.x)
            .unwrap()
            .then_with(|| a.y.partial_cmp(&b.y).unwrap())
    });

    let mut hull: Vec<Point> = Vec::with_capacity(2 * n);

    // Lower hull
    for p in &sorted {
        while hull.len() >= 2 && cross(&hull[hull.len() - 2], &hull[hull.len() - 1], p) <= 0.0 {
            hull.pop();
        }
        hull.push((*p).clone());
    }

    // Upper hull
    let lower_len = hull.len() + 1;
    for p in sorted.iter().rev().skip(1) {
        while hull.len() >= lower_len && cross(&hull[hull.len() - 2], &hull[hull.len() - 1], p) <= 0.0 {
            hull.pop();
        }
        hull.push((*p).clone());
    }

    hull.pop(); // Remove last point (duplicate of first)
    // Close the polygon
    if let Some(first) = hull.first() {
        hull.push(first.clone());
    }

    Polygon::new(hull)
}

fn cross(o: &Point, a: &Point, b: &Point) -> f64 {
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/// Ray-casting point-in-polygon test — O(n).
pub fn point_in_polygon(point: &Point, polygon: &Polygon) -> bool {
    // Quick bbox check
    let [min_x, min_y, max_x, max_y] = polygon.bbox;
    if point.x < min_x || point.x > max_x || point.y < min_y || point.y > max_y {
        return false;
    }

    let vertices = &polygon.vertices;
    let n = vertices.len();
    if n < 3 {
        return false;
    }

    let mut inside = false;
    let mut j = n - 1;

    for i in 0..n {
        let vi = &vertices[i];
        let vj = &vertices[j];

        if ((vi.y > point.y) != (vj.y > point.y))
            && (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)
        {
            inside = !inside;
        }
        j = i;
    }

    inside
}

/// Create a circular polygon (for tree canopies).
pub fn create_circle(center: &Point, radius_meters: f64, segments: usize) -> Polygon {
    let mut vertices = Vec::with_capacity(segments + 1);
    for i in 0..=segments {
        let angle = 2.0 * PI * (i as f64) / (segments as f64);
        let dx = meters_to_deg_lng(radius_meters * angle.cos(), center.y);
        let dy = meters_to_deg_lat(radius_meters * angle.sin());
        vertices.push(Point {
            x: center.x + dx,
            y: center.y + dy,
        });
    }
    Polygon::new(vertices)
}

/// Check if any polygon in the list contains the given point.
pub fn point_in_any_polygon(point: &Point, polygons: &[Polygon]) -> bool {
    for polygon in polygons {
        if point_in_polygon(point, polygon) {
            return true;
        }
    }
    false
}
