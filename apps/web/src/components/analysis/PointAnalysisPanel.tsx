import { useAnalysisStore } from "../../store/analysisStore";
import { SunTimeline } from "./SunTimeline";

export function PointAnalysisPanel() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const isAnalyzing = useAnalysisStore((s) => s.isAnalyzing);
  const clearAnalysis = useAnalysisStore((s) => s.clearAnalysis);

  if (!analysisResult && !isAnalyzing) return null;

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
    <div className="absolute top-4 right-4 z-20 w-80 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
        <h2 className="font-semibold text-gray-800">Sonnen-Analyse</h2>
        <button
          onClick={clearAnalysis}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {isAnalyzing && (
        <div className="p-6 text-center text-gray-500">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Analysiere Sonnenverlauf...
        </div>
      )}

      {analysisResult && !isAnalyzing && (
        <div className="p-4 space-y-4">
          {/* Current status */}
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                analysisResult.currentlyInSun
                  ? "bg-amber-100"
                  : "bg-gray-100"
              }`}
            >
              {analysisResult.currentlyInSun ? "\u2600\uFE0F" : "\uD83C\uDF25\uFE0F"}
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {analysisResult.currentlyInSun ? "In der Sonne" : "Im Schatten"}
              </p>
              <p className="text-sm text-gray-500">
                {analysisResult.currentlyInSun && analysisResult.remainingSunMinutes != null
                  ? `Noch ${formatDuration(analysisResult.remainingSunMinutes)} Sonne`
                  : analysisResult.nextSunTime
                    ? `Sonne ab ${formatTime(analysisResult.nextSunTime)}`
                    : "Heute keine Sonne mehr"}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Sonne heute</p>
              <p className="text-lg font-bold text-amber-700">
                {formatDuration(analysisResult.totalSunMinutesToday)}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Sonnenwinkel</p>
              <p className="text-lg font-bold text-blue-700">
                {analysisResult.sunAngle > 0
                  ? `${analysisResult.sunAngle.toFixed(1)}\u00B0`
                  : "Unter Horizont"}
              </p>
            </div>
          </div>

          {/* Best sun window */}
          {analysisResult.bestSunWindow && (
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Beste Sonnenzeit</p>
              <p className="font-semibold text-green-700">
                {formatTime(analysisResult.bestSunWindow.start)}
                {" \u2013 "}
                {formatTime(analysisResult.bestSunWindow.end)}
              </p>
            </div>
          )}

          {/* Timeline chart */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Sonnenverlauf</p>
            <SunTimeline timeline={analysisResult.timeline} />
          </div>

          {/* Coordinates */}
          <p className="text-xs text-gray-400 text-center">
            {analysisResult.location[1].toFixed(5)}, {analysisResult.location[0].toFixed(5)}
          </p>
        </div>
      )}
    </div>
  );
}
