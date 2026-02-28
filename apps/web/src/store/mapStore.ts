import { create } from "zustand";

interface MapState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  bounds: [number, number, number, number] | null;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBearing: (bearing: number) => void;
  setPitch: (pitch: number) => void;
  setBounds: (bounds: [number, number, number, number]) => void;
}

// Default: Vienna Stephansplatz
const DEFAULT_CENTER: [number, number] = [16.3738, 48.2082];
const DEFAULT_ZOOM = 15;

export const useMapStore = create<MapState>((set) => ({
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  bearing: 0,
  pitch: 60,
  bounds: null,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBearing: (bearing) => set({ bearing }),
  setPitch: (pitch) => set({ pitch }),
  setBounds: (bounds) => set({ bounds }),
}));
