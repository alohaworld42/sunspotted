import type { POI, POICategory, POISunScore } from "../../types/poi";

interface POIDetailCardProps {
  poi: POI;
  sunScore: POISunScore | null;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<POICategory, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  beer_garden: "Biergarten",
  park: "Park",
  table_tennis: "Tischtennis",
  volleyball: "Volleyball",
  basketball: "Basketball",
};

export function POIDetailCard({ poi, sunScore, onClose }: POIDetailCardProps) {
  const formatTime = (date: Date) =>
    date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} Min`;
    if (m === 0) return `${h} Std`;
    return `${h} Std ${m} Min`;
  };

  return (
    <div className="absolute bottom-20 left-4 z-20 w-80 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {sunScore?.currentlyInSun ? "\u2600\uFE0F" : "\u2601\uFE0F"}
          </span>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm leading-tight">{poi.name}</h3>
            <p className="text-xs text-gray-500">{CATEGORY_LABELS[poi.category]}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
        >
          &times;
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Sun status */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              sunScore?.currentlyInSun
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {sunScore?.currentlyInSun ? "Aktuell in der Sonne" : "Aktuell im Schatten"}
          </div>
          {poi.hasOutdoor && (
            <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Terrasse
            </div>
          )}
        </div>

        {sunScore && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500">Nächste 1h</p>
                <p className="text-sm font-bold text-amber-700">
                  {formatDuration(sunScore.sunMinutesNextHour)}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500">Nächste 3h</p>
                <p className="text-sm font-bold text-orange-700">
                  {formatDuration(sunScore.sunMinutesNext3Hours)}
                </p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500">Gesamt</p>
                <p className="text-sm font-bold text-yellow-700">
                  {formatDuration(sunScore.totalSunToday)}
                </p>
              </div>
            </div>

            {/* Best window */}
            {sunScore.bestSunWindow && (
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Beste Sonnenzeit</p>
                <p className="text-sm font-semibold text-green-700">
                  {formatTime(sunScore.bestSunWindow.start)}
                  {" \u2013 "}
                  {formatTime(sunScore.bestSunWindow.end)}
                </p>
              </div>
            )}

            {/* Sun score bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">Sonnen-Score</p>
                <p className="text-xs font-bold text-amber-700">{sunScore.score}/100</p>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${sunScore.score}%`,
                    background:
                      sunScore.score >= 70
                        ? "#f59e0b"
                        : sunScore.score >= 40
                          ? "#fb923c"
                          : "#9ca3af",
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* Opening hours */}
        {poi.openingHours && (
          <p className="text-xs text-gray-400">
            Öffnungszeiten: {poi.openingHours}
          </p>
        )}
      </div>
    </div>
  );
}
