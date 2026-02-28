export interface Building {
  id: string;
  osmId?: number;
  height: number;
  levels?: number;
  heightSource: "osm" | "estimated" | "lidar";
}

export type POICategory = "cafe" | "restaurant" | "park" | "beer_garden";

export interface POI {
  id: string;
  osmId?: number;
  name: string;
  category: POICategory;
  location: [number, number];
  hasOutdoor: boolean;
}

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
}
