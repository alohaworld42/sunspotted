import { useCallback } from "react";
import { MapContainer } from "./components/map/MapContainer";
import { TimeSlider } from "./components/controls/TimeSlider";
import { SunInfoPanel } from "./components/controls/SunInfoPanel";
import { AddressSearch } from "./components/controls/AddressSearch";
import { PointAnalysisPanel } from "./components/analysis/PointAnalysisPanel";
import { usePointAnalysis } from "./hooks/usePointAnalysis";
import { usePOIs } from "./hooks/usePOIs";
import { useAnalysisStore } from "./store/analysisStore";
import type { POI } from "./types/poi";

export function App() {
  const { pois, isLoading: poisLoading, showPOIs, togglePOIs, refetch } = usePOIs();
  const { analyzePoint } = usePointAnalysis();
  const setSelectedPOIName = useAnalysisStore((s) => s.setSelectedPOIName);

  const handlePoiSelect = useCallback((poi: POI) => {
    setSelectedPOIName(poi.name);
    analyzePoint(poi.location);
  }, [analyzePoint, setSelectedPOIName]);

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <MapContainer
        pois={showPOIs ? pois : []}
        onPoiSelect={handlePoiSelect}
      />

      {/* Top-center: Address search */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <AddressSearch />
      </div>

      {/* Top-left: Sun info */}
      <div className="absolute top-4 left-4 z-10">
        <SunInfoPanel />
      </div>

      {/* Top-right: Point analysis results */}
      <PointAnalysisPanel />

      {/* Bottom-left: POI toggle + refetch */}
      <div className="absolute bottom-20 left-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={togglePOIs}
          className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            showPOIs
              ? "text-amber-700 bg-amber-50/90 ring-2 ring-amber-400"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title={showPOIs ? "Cafés ausblenden" : "Cafés anzeigen"}
        >
          <span className="text-base">{"\u2615"}</span>
          {showPOIs ? "Cafés an" : "Cafés"}
          {poisLoading && (
            <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          )}
        </button>

        {showPOIs && (
          <button
            type="button"
            onClick={refetch}
            className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Cafés in diesem Bereich neu laden"
          >
            Hier suchen ({pois.length})
          </button>
        )}
      </div>

      {/* Bottom: Time slider */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <TimeSlider />
      </div>
    </div>
  );
}
