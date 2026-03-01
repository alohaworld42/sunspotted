import { useCallback, useEffect, useState } from "react";
import { MapContainer } from "./components/map/MapContainer";
import { TimeSlider } from "./components/controls/TimeSlider";
import { SunInfoPanel } from "./components/controls/SunInfoPanel";
import { AddressSearch } from "./components/controls/AddressSearch";
import { PointAnalysisPanel } from "./components/analysis/PointAnalysisPanel";
import { usePointAnalysis } from "./hooks/usePointAnalysis";
import { usePOIs } from "./hooks/usePOIs";
import { useSportPOIs } from "./hooks/useSportPOIs";
import { useAnalysisStore } from "./store/analysisStore";
import type { POI } from "./types/poi";
import { initWasm } from "./lib/wasm/engine";

export function App() {
  // Initialize WASM engine on mount (non-blocking)
  useEffect(() => {
    initWasm();
  }, []);
  const { pois, isLoading: poisLoading, showPOIs, togglePOIs, refetch } = usePOIs();
  const { pois: sportPois, isLoading: sportsLoading, showSports, toggleSports } = useSportPOIs();
  const { analyzePoint } = usePointAnalysis();
  const setSelectedPOIName = useAnalysisStore((s) => s.setSelectedPOIName);
  const selectedPoint = useAnalysisStore((s) => s.selectedPoint);
  const showTreeShadows = useAnalysisStore((s) => s.showTreeShadows);
  const setShowTreeShadows = useAnalysisStore((s) => s.setShowTreeShadows);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [showTimeBar, setShowTimeBar] = useState(false);

  const handlePoiSelect = useCallback((poi: POI) => {
    setSelectedPOIName(poi.name);
    analyzePoint(poi.location);
  }, [analyzePoint, setSelectedPOIName]);

  const toggleSatellite = useCallback(() => {
    setSatelliteOn((prev) => !prev);
  }, []);

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <MapContainer
        pois={[...(showPOIs ? pois : []), ...(showSports ? sportPois : [])]}
        onPoiSelect={handlePoiSelect}
        satelliteOn={satelliteOn}
      />

      {/* Top-center: Address search */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <AddressSearch />
      </div>

      {/* Top-left: Sun info — hides when a spot is selected */}
      {!selectedPoint && (
        <div className="absolute top-4 left-4 z-10">
          <SunInfoPanel />
        </div>
      )}

      {/* Top-right: Point analysis results */}
      <PointAnalysisPanel />

      {/* Top: Toggle buttons row — below search bar */}
      <div className="absolute top-16 left-0 right-0 z-10 flex items-center gap-2 px-4">
        {/* Satellite toggle */}
        <button
          type="button"
          onClick={toggleSatellite}
          className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            satelliteOn
              ? "text-blue-700 bg-blue-50/90 ring-2 ring-blue-400"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title={satelliteOn ? "Karte anzeigen" : "Satellit anzeigen"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {satelliteOn ? "Karte" : "Satellit"}
        </button>

        {/* Café toggle */}
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
          Cafés
          {poisLoading && (
            <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          )}
        </button>

        {/* Tree shadow toggle */}
        <button
          type="button"
          onClick={() => setShowTreeShadows(!showTreeShadows)}
          className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            showTreeShadows
              ? "text-green-700 bg-green-50/90 ring-2 ring-green-400"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title={showTreeShadows ? "Baumschatten ausblenden" : "Baumschatten anzeigen"}
        >
          <span className="text-base">{"\uD83C\uDF33"}</span>
        </button>

        {/* Sport facilities toggle */}
        <button
          type="button"
          onClick={toggleSports}
          className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            showSports
              ? "text-blue-700 bg-blue-50/90 ring-2 ring-blue-400"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title={showSports ? "Sport ausblenden" : "Sport anzeigen"}
        >
          <span className="text-base">{"\uD83C\uDFD3"}</span>
          Sport
          {sportsLoading && (
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </button>

        {/* Refetch near point */}
        {showPOIs && pois.length > 0 && (
          <button
            type="button"
            onClick={refetch}
            className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Cafés neu laden"
          >
            {pois.length} Cafés
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Time bar toggle */}
        <button
          type="button"
          onClick={() => setShowTimeBar((prev) => !prev)}
          className={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            showTimeBar
              ? "text-amber-700 bg-amber-50/90 ring-2 ring-amber-400"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title={showTimeBar ? "Zeitleiste ausblenden" : "Zeitleiste anzeigen"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Zeit
        </button>
      </div>

      {/* Bottom: Collapsible time slider */}
      {showTimeBar && (
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <TimeSlider />
        </div>
      )}
    </div>
  );
}
