import { useSunPosition } from "../../hooks/useSunPosition";
import { useTimeStore } from "../../store/timeStore";

export function SunInfoPanel() {
  const currentTime = useTimeStore((s) => s.currentTime);
  const isLive = useTimeStore((s) => s.isLive);
  const { position, times, isUp } = useSunPosition();

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 min-w-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{isUp ? "\u2600\uFE0F" : "\uD83C\uDF19"}</span>
        <div>
          <h1 className="text-lg font-bold text-gray-800 leading-tight">Sunspotted</h1>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-600">
              {currentTime.toLocaleDateString("de-DE", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sun data */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Azimut</span>
          <span className="font-medium text-gray-800">{position.azimuthDeg.toFixed(1)}°</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Höhe</span>
          <span className="font-medium text-gray-800">
            {position.altitudeDeg > 0 ? `${position.altitudeDeg.toFixed(1)}°` : "unter Horizont"}
          </span>
        </div>

        <div className="border-t border-gray-200 my-2" />

        <div className="flex justify-between">
          <span className="text-gray-500">Aufgang</span>
          <span className="font-medium text-gray-800">{formatTime(times.sunrise)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Untergang</span>
          <span className="font-medium text-gray-800">{formatTime(times.sunset)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Golden Hour</span>
          <span className="font-medium text-amber-600">{formatTime(times.goldenHour)}</span>
        </div>
      </div>
    </div>
  );
}
