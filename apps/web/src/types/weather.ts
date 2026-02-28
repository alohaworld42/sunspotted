export interface WeatherData {
  temperature: number;
  feelsLike: number;
  cloudCover: number;
  uvIndex: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  description: string;
  icon: string;
}

export interface ComfortScore {
  score: number;
  label: "Perfect" | "Warm" | "Pleasant" | "Cool" | "Cold";
}
