import { create } from "zustand";
import type { POICategory } from "../types/poi";

interface FilterState {
  categories: POICategory[];
  minSunMinutes: number;
  showPOIs: boolean;
  showHeatmap: boolean;
  showSunPath: boolean;
  sortBy: "sun_duration" | "distance" | "rating";
  toggleCategory: (category: POICategory) => void;
  setMinSunMinutes: (minutes: number) => void;
  setShowPOIs: (show: boolean) => void;
  setShowHeatmap: (show: boolean) => void;
  setShowSunPath: (show: boolean) => void;
  setSortBy: (sort: "sun_duration" | "distance" | "rating") => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  categories: ["cafe", "restaurant", "park", "beer_garden"],
  minSunMinutes: 0,
  showPOIs: false,
  showHeatmap: false,
  showSunPath: false,
  sortBy: "sun_duration",

  toggleCategory: (category) =>
    set((state) => ({
      categories: state.categories.includes(category)
        ? state.categories.filter((c) => c !== category)
        : [...state.categories, category],
    })),
  setMinSunMinutes: (minutes) => set({ minSunMinutes: minutes }),
  setShowPOIs: (show) => set({ showPOIs: show }),
  setShowHeatmap: (show) => set({ showHeatmap: show }),
  setShowSunPath: (show) => set({ showSunPath: show }),
  setSortBy: (sort) => set({ sortBy: sort }),
}));
