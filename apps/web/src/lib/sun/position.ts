import SunCalc from "suncalc";
import type { SunPosition, SunTimes } from "../../types/sun";

/**
 * Get the sun's position for a given time and location.
 * Uses suncalc which implements the NOAA solar calculation algorithm.
 */
export function getSunPosition(
  date: Date,
  lat: number,
  lng: number,
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
    // SunCalc returns azimuth from south (0), clockwise. Convert to north-based for display.
    azimuthDeg: ((pos.azimuth * 180) / Math.PI + 180) % 360,
    altitudeDeg: (pos.altitude * 180) / Math.PI,
  };
}

/**
 * Get sun event times (sunrise, sunset, golden hour, etc.) for a date and location.
 */
export function getSunTimes(
  date: Date,
  lat: number,
  lng: number,
): SunTimes {
  const times = SunCalc.getTimes(date, lat, lng);
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
    goldenHour: times.goldenHour,
    goldenHourEnd: times.goldenHourEnd,
    dawn: times.dawn,
    dusk: times.dusk,
  };
}

/**
 * Check if the sun is above the horizon at a given time and location.
 */
export function isSunUp(date: Date, lat: number, lng: number): boolean {
  const pos = SunCalc.getPosition(date, lat, lng);
  return pos.altitude > 0;
}
