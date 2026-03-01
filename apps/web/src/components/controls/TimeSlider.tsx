import { useCallback, useEffect, useRef } from "react";
import { useTimeStore } from "../../store/timeStore";
import { useMapStore } from "../../store/mapStore";
import { getSunTimes } from "../../lib/sun/position";

export function TimeSlider() {
  const { currentTime, isLive, isPlaying, playSpeed, setTime, setPlaying, resetToNow, setPlaySpeed } =
    useTimeStore();
  const center = useMapStore((s) => s.center);
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const sunTimes = getSunTimes(currentTime, center[1], center[0]);
  const dayStart = sunTimes.sunrise;
  const dayEnd = sunTimes.sunset;

  const totalMinutes =
    (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
  const currentMinutes =
    (currentTime.getTime() - dayStart.getTime()) / (1000 * 60);
  const progress = Math.max(0, Math.min(1, currentMinutes / totalMinutes));

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      const minutesFromStart = value * totalMinutes;
      const newTime = new Date(
        dayStart.getTime() + minutesFromStart * 60 * 1000,
      );
      setTime(newTime);
    },
    [dayStart, totalMinutes, setTime],
  );

  // Change date while preserving the hour/minute
  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const dateStr = e.target.value; // "YYYY-MM-DD"
      if (!dateStr) return;
      const [year, month, day] = dateStr.split("-").map(Number);
      const newTime = new Date(currentTime);
      newTime.setFullYear(year, month - 1, day);
      setTime(newTime);
    },
    [currentTime, setTime],
  );

  // Direct time input
  const handleTimeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const timeStr = e.target.value; // "HH:MM"
      if (!timeStr) return;
      const [hours, minutes] = timeStr.split(":").map(Number);
      const newTime = new Date(currentTime);
      newTime.setHours(hours, minutes, 0, 0);
      setTime(newTime);
    },
    [currentTime, setTime],
  );

  // Track current simulated time in a ref so the animation loop always reads the latest value
  const simulatedTimeRef = useRef<number>(currentTime.getTime());
  simulatedTimeRef.current = currentTime.getTime();

  // Cache dayEnd in a ref so the animation tick sees the latest value
  const dayEndRef = useRef<number>(dayEnd.getTime());
  dayEndRef.current = dayEnd.getTime();

  // Animation loop for play mode
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      // playSpeed = minutes of simulated time per real second
      const simulatedMs = (deltaMs / 1000) * playSpeed * 60 * 1000;
      const newTimeMs = simulatedTimeRef.current + simulatedMs;

      if (newTimeMs >= dayEndRef.current) {
        setPlaying(false);
        setTime(new Date(dayEndRef.current));
        return;
      }

      setTime(new Date(newTimeMs));
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, playSpeed, setTime, setPlaying]);

  // Live mode: update every 60 seconds
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      useTimeStore.getState().resetToNow();
    }, 60_000);

    return () => clearInterval(interval);
  }, [isLive]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });

  // Format date for input[type=date] value: "YYYY-MM-DD"
  const dateValue = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, "0")}-${String(currentTime.getDate()).padStart(2, "0")}`;

  // Format time for input[type=time] value: "HH:MM"
  const timeValue = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="bg-white/95 backdrop-blur-sm mx-4 mb-4 rounded-xl shadow-lg p-4">
      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="0" width="4" height="14" />
              <rect x="9" y="0" width="4" height="14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <polygon points="2,0 14,7 2,14" />
            </svg>
          )}
        </button>

        {/* Date + Time inputs */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={timeValue}
              onChange={handleTimeInput}
              className="text-lg font-bold text-gray-800 bg-transparent border-none outline-none w-[70px] text-center cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateValue}
              onChange={handleDateChange}
              className="text-xs text-gray-500 bg-transparent border-none outline-none cursor-pointer"
            />
          </div>
          {isLive && (
            <span className="text-xs text-green-600 font-medium">Live</span>
          )}
          {!isLive && (
            <button
              onClick={resetToNow}
              className="text-xs text-amber-600 hover:text-amber-700 cursor-pointer"
            >
              Jetzt
            </button>
          )}
        </div>

        {/* Slider */}
        <div className="flex-1 flex flex-col">
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={handleSliderChange}
            className="w-full h-2 bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatTime(dayStart)}</span>
            <span>{formatTime(dayEnd)}</span>
          </div>
        </div>

        {/* Speed control */}
        <select
          value={playSpeed}
          onChange={(e) => setPlaySpeed(Number(e.target.value))}
          className="text-sm bg-gray-100 rounded-lg px-2 py-1 border-none cursor-pointer"
        >
          <option value={1}>1x</option>
          <option value={5}>5x</option>
          <option value={15}>15x</option>
          <option value={30}>30x</option>
          <option value={60}>60x</option>
        </select>
      </div>
    </div>
  );
}
