export interface SunPosition {
  azimuth: number;
  altitude: number;
  azimuthDeg: number;
  altitudeDeg: number;
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  goldenHour: Date;
  goldenHourEnd: Date;
  dawn: Date;
  dusk: Date;
}
