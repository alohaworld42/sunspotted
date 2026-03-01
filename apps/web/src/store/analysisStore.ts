import { create } from "zustand";
import type { PointAnalysisResult } from "../types/analysis";
import type { ShadowPolygon } from "../types/shadow";
import type { Building } from "../types/building";

interface AnalysisState {
  selectedPoint: [number, number] | null;
  analysisResult: PointAnalysisResult | null;
  isAnalyzing: boolean;
  /** Ground-only shadows around the selected point (for map rendering) */
  analysisShadows: ShadowPolygon[];
  /** Buildings fetched around the selected point */
  analysisBuildings: Building[];
  /** Name of the selected POI (if analysis was triggered by clicking a POI) */
  selectedPOIName: string | null;
  setSelectedPoint: (point: [number, number] | null) => void;
  setAnalysisResult: (result: PointAnalysisResult | null) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalysisShadows: (shadows: ShadowPolygon[]) => void;
  setAnalysisBuildings: (buildings: Building[]) => void;
  setSelectedPOIName: (name: string | null) => void;
  clearAnalysis: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  selectedPoint: null,
  analysisResult: null,
  isAnalyzing: false,
  analysisShadows: [],
  analysisBuildings: [],
  selectedPOIName: null,

  setSelectedPoint: (point) => set({ selectedPoint: point }),
  setAnalysisResult: (result) => set({ analysisResult: result }),
  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalysisShadows: (shadows) => set({ analysisShadows: shadows }),
  setAnalysisBuildings: (buildings) => set({ analysisBuildings: buildings }),
  setSelectedPOIName: (name) => set({ selectedPOIName: name }),
  clearAnalysis: () =>
    set({
      analysisResult: null,
      isAnalyzing: false,
      selectedPOIName: null,
    }),
}));
