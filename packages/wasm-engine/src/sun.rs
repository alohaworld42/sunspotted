use std::f64::consts::PI;

const RAD: f64 = PI / 180.0;
const DAY_MS: f64 = 86_400_000.0;
const J1970: f64 = 2_440_588.0;
const J2000: f64 = 2_451_545.0;
const E: f64 = RAD * 23.4397; // obliquity of earth

fn to_julian(timestamp_ms: f64) -> f64 {
    timestamp_ms / DAY_MS - 0.5 + J1970
}

fn to_days(timestamp_ms: f64) -> f64 {
    to_julian(timestamp_ms) - J2000
}

fn right_ascension(l: f64, b: f64) -> f64 {
    (l.sin() * E.cos() - b.tan() * E.sin()).atan2(l.cos())
}

fn declination(l: f64, b: f64) -> f64 {
    (b.sin() * E.cos() + b.cos() * E.sin() * l.sin()).asin()
}

fn azimuth(h: f64, phi: f64, dec: f64) -> f64 {
    h.sin().atan2(h.cos() * phi.sin() - dec.tan() * phi.cos())
}

fn altitude(h: f64, phi: f64, dec: f64) -> f64 {
    (phi.sin() * dec.sin() + phi.cos() * dec.cos() * h.cos()).asin()
}

fn sidereal_time(d: f64, lw: f64) -> f64 {
    RAD * (280.16 + 360.985_623_5 * d) - lw
}

fn solar_mean_anomaly(d: f64) -> f64 {
    RAD * (357.5291 + 0.985_600_28 * d)
}

fn ecliptic_longitude(m: f64) -> f64 {
    let c = RAD * (1.9148 * m.sin() + 0.02 * (2.0 * m).sin() + 0.0003 * (3.0 * m).sin());
    let p = RAD * 102.9372; // perihelion of earth
    m + c + p + PI
}

/// Returns (azimuth, altitude) in radians.
/// Azimuth: 0 = south, positive = west (clockwise) — matches suncalc convention.
/// Altitude: radians above horizon.
pub fn sun_position(timestamp_ms: f64, lat: f64, lng: f64) -> (f64, f64) {
    let lw = RAD * (-lng);
    let phi = RAD * lat;
    let d = to_days(timestamp_ms);

    let m = solar_mean_anomaly(d);
    let l = ecliptic_longitude(m);
    let dec = declination(l, 0.0);
    let ra = right_ascension(l, 0.0);
    let h = sidereal_time(d, lw) - ra;

    let az = azimuth(h, phi, dec);
    let alt = altitude(h, phi, dec);

    (az, alt)
}

/// Atmospheric refraction correction for sunrise/sunset calculations.
fn julian_cycle(d: f64, lw: f64) -> f64 {
    (d - 0.0009 - lw / (2.0 * PI)).round()
}

fn approx_transit(ht: f64, lw: f64, n: f64) -> f64 {
    0.0009 + (ht + lw) / (2.0 * PI) + n
}

fn solar_transit_j(ds: f64, m: f64, l: f64) -> f64 {
    J2000 + ds + 0.0053 * m.sin() - 0.0069 * (2.0 * l).sin()
}

fn hour_angle(h: f64, phi: f64, d: f64) -> f64 {
    let val = (h.sin() - phi.sin() * d.sin()) / (phi.cos() * d.cos());
    val.clamp(-1.0, 1.0).acos()
}

fn get_set_j(h: f64, lw: f64, phi: f64, dec: f64, n: f64, m: f64, l: f64) -> f64 {
    let w = hour_angle(h, phi, dec);
    let a = approx_transit(w, lw, n);
    solar_transit_j(a, m, l)
}

fn from_julian(j: f64) -> f64 {
    (j + 0.5 - J1970) * DAY_MS
}

/// Returns (sunrise_ms, sunset_ms) as millisecond timestamps.
/// Uses standard -0.833 degree angle for atmospheric refraction.
pub fn sun_times(timestamp_ms: f64, lat: f64, lng: f64) -> (f64, f64) {
    let lw = RAD * (-lng);
    let phi = RAD * lat;
    let d = to_days(timestamp_ms);
    let n = julian_cycle(d, lw);
    let ds = approx_transit(0.0, lw, n);
    let m = solar_mean_anomaly(ds);
    let l = ecliptic_longitude(m);
    let dec = declination(l, 0.0);
    let j_noon = solar_transit_j(ds, m, l);

    let h0 = RAD * (-0.833); // standard sunrise/sunset angle
    let j_set = get_set_j(h0, lw, phi, dec, n, m, l);
    let j_rise = j_noon - (j_set - j_noon);

    (from_julian(j_rise), from_julian(j_set))
}
