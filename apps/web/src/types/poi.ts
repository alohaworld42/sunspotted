export type POICategory = "cafe" | "restaurant" | "park" | "beer_garden" | "table_tennis" | "volleyball" | "basketball";

export interface POI {
  id: string;
  osmId?: number;
  name: string;
  category: POICategory;
  location: [number, number];
  hasOutdoor: boolean;
  openingHours?: string;
  tags?: Record<string, string>;
}

export interface POISunScore {
  poiId: string;
  currentlyInSun: boolean;
  sunMinutesNextHour: number;
  sunMinutesNext3Hours: number;
  totalSunToday: number;
  bestSunWindow: { start: Date; end: Date } | null;
  score: number;
}
