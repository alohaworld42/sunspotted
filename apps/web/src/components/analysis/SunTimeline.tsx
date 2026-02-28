import type { TimeSlot } from "../../types/analysis";

interface SunTimelineProps {
  timeline: TimeSlot[];
}

/**
 * Visual timeline showing sun/shade periods throughout the day.
 * Each slot is a colored bar segment - yellow for sun, gray for shade.
 */
export function SunTimeline({ timeline }: SunTimelineProps) {
  if (timeline.length === 0) return null;

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  const firstTime = timeline[0].time;
  const lastTime = timeline[timeline.length - 1].time;

  return (
    <div>
      {/* Bar chart */}
      <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
        {timeline.map((slot, i) => (
          <div
            key={i}
            className={`flex-1 transition-colors ${
              slot.inSun
                ? "bg-amber-400 hover:bg-amber-500"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
            title={`${formatTime(slot.time)}: ${slot.inSun ? "Sonne" : "Schatten"} (${(slot.sunAltitude * 180 / Math.PI).toFixed(0)}\u00B0)`}
          />
        ))}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{formatTime(firstTime)}</span>
        <span className="text-xs text-gray-400">
          {formatTime(
            new Date(
              (firstTime.getTime() + lastTime.getTime()) / 2,
            ),
          )}
        </span>
        <span className="text-xs text-gray-400">{formatTime(lastTime)}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-amber-400" />
          <span className="text-xs text-gray-500">Sonne</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-200" />
          <span className="text-xs text-gray-500">Schatten</span>
        </div>
      </div>
    </div>
  );
}
