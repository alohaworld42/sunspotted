export interface TimeSlot {
  time: Date;
  inSun: boolean;
  sunAltitude: number;
  sunAzimuth: number;
}

export interface PointAnalysisResult {
  location: [number, number];
  currentlyInSun: boolean;
  remainingSunMinutes: number | null;
  nextSunTime: Date | null;
  totalSunMinutesToday: number;
  sunAngle: number;
  timeline: TimeSlot[];
  bestSunWindow: { start: Date; end: Date } | null;
}
