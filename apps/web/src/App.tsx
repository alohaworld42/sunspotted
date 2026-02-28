import { MapContainer } from "./components/map/MapContainer";
import { TimeSlider } from "./components/controls/TimeSlider";
import { SunInfoPanel } from "./components/controls/SunInfoPanel";
import { AddressSearch } from "./components/controls/AddressSearch";
import { PointAnalysisPanel } from "./components/analysis/PointAnalysisPanel";

export function App() {
  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <MapContainer />

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

      {/* Bottom: Time slider */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <TimeSlider />
      </div>
    </div>
  );
}
