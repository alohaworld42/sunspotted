import { useState } from "react";
import { useFilterStore } from "../../store/filterStore";
import type { POICategory } from "../../types/poi";

const CATEGORY_CONFIG: { key: POICategory; label: string; icon: string }[] = [
  { key: "cafe", label: "Cafés", icon: "\u2615" },
  { key: "restaurant", label: "Restaurants", icon: "\uD83C\uDF7D\uFE0F" },
  { key: "beer_garden", label: "Biergärten", icon: "\uD83C\uDF7A" },
  { key: "park", label: "Parks", icon: "\uD83C\uDF33" },
];

export function FilterPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const showPOIs = useFilterStore((s) => s.showPOIs);
  const setShowPOIs = useFilterStore((s) => s.setShowPOIs);
  const categories = useFilterStore((s) => s.categories);
  const toggleCategory = useFilterStore((s) => s.toggleCategory);
  const minSunMinutes = useFilterStore((s) => s.minSunMinutes);
  const setMinSunMinutes = useFilterStore((s) => s.setMinSunMinutes);
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => {
          if (!showPOIs) setShowPOIs(true);
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm font-medium transition-colors ${
          showPOIs
            ? "bg-amber-50 text-amber-800"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span>{showPOIs ? "\u2600\uFE0F" : "\uD83D\uDD0D"}</span>
        <span>Sonnige Orte</span>
        {showPOIs && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPOIs(false);
              setIsOpen(false);
            }}
            className="ml-auto text-gray-400 hover:text-gray-600 text-xs"
          >
            Aus
          </button>
        )}
      </button>

      {/* Expanded panel */}
      {isOpen && showPOIs && (
        <div className="p-3 border-t border-gray-100 space-y-3">
          {/* Categories */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Kategorien</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_CONFIG.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => toggleCategory(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    categories.includes(key)
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-gray-100 text-gray-500 border border-gray-200"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Min sun duration */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Min. Sonne (nächste 3h)</p>
              <span className="text-xs font-medium text-amber-700">
                {minSunMinutes > 0 ? `${minSunMinutes} Min` : "Egal"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              step={15}
              value={minSunMinutes}
              onChange={(e) => setMinSunMinutes(Number(e.target.value))}
              className="w-full mt-1 accent-amber-500"
            />
          </div>

          {/* Sort */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Sortierung</p>
            <div className="flex gap-1.5">
              {[
                { key: "sun_duration" as const, label: "Meiste Sonne" },
                { key: "distance" as const, label: "Nächste" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    sortBy === key
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-gray-100 text-gray-500 border border-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
