import type { POI, POISunScore } from "../../types/poi";

interface SunnyCafePanelProps {
  cafes: POI[];
  sunScores: Map<string, POISunScore>;
  isSearching: boolean;
  onSelect: (poi: POI) => void;
  onClose: () => void;
}

export function SunnyCafePanel({
  cafes,
  sunScores,
  isSearching,
  onSelect,
  onClose,
}: SunnyCafePanelProps) {
  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${m}m`;
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 max-h-[60vh] bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{"\u2600\uFE0F"}</span>
          <div>
            <h2 className="font-semibold text-gray-800 text-sm">
              Sonnige Caf&eacute;s
            </h2>
            <p className="text-xs text-gray-500">
              {isSearching
                ? "Suche..."
                : `${cafes.length} Ergebnisse`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
        >
          &times;
        </button>
      </div>

      {/* Loading */}
      {isSearching && (
        <div className="p-6 text-center text-gray-500">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Analysiere Sonnenverlauf...
        </div>
      )}

      {/* Results list */}
      {!isSearching && cafes.length > 0 && (
        <div className="overflow-y-auto flex-1">
          {cafes.map((cafe, index) => {
            const score = sunScores.get(cafe.id);
            const inSun = score?.currentlyInSun ?? false;

            return (
              <button
                key={cafe.id}
                type="button"
                onClick={() => onSelect(cafe)}
                className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Rank badge */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      index < 3
                        ? "bg-amber-400 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + status */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {cafe.name}
                      </span>
                      {inSun && (
                        <span className="text-xs">{"\u2600\uFE0F"}</span>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {cafe.hasOutdoor && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                          Terrasse
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          inSun
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inSun ? "Sonne" : "Schatten"}
                      </span>
                      {cafe.openingHours && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600">
                          {cafe.openingHours.length > 20
                            ? cafe.openingHours.slice(0, 20) + "..."
                            : cafe.openingHours}
                        </span>
                      )}
                    </div>

                    {/* Sun stats */}
                    {score && (
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                        <span>
                          Score: <strong className="text-amber-700">{score.score}</strong>/100
                        </span>
                        <span>
                          3h: {formatDuration(score.sunMinutesNext3Hours)}
                        </span>
                        {score.bestSunWindow && (
                          <span>
                            Beste: {formatTime(score.bestSunWindow.start)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Score ring */}
                  {score && (
                    <div className="flex-shrink-0">
                      <ScoreRing score={score.score} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No results */}
      {!isSearching && cafes.length === 0 && (
        <div className="p-6 text-center text-gray-400 text-sm">
          Keine Caf&eacute;s in diesem Bereich gefunden.
          <br />
          Zoome rein oder verschiebe die Karte.
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#f59e0b" : score >= 40 ? "#fb923c" : "#9ca3af";

  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[9px] font-bold"
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}
