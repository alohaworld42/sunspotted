import { useMemo } from "react";
import { getSunPosition, getSunTimes, isSunUp } from "../lib/sun/position";
import { useTimeStore } from "../store/timeStore";
import { useMapStore } from "../store/mapStore";
import type { SunPosition, SunTimes } from "../types/sun";

interface UseSunPositionResult {
  position: SunPosition;
  times: SunTimes;
  isUp: boolean;
}

/**
 * Hook that provides the current sun position and times
 * based on the selected time and map center.
 */
export function useSunPosition(): UseSunPositionResult {
  const currentTime = useTimeStore((s) => s.currentTime);
  const center = useMapStore((s) => s.center);

  const position = useMemo(
    () => getSunPosition(currentTime, center[1], center[0]),
    [currentTime, center],
  );

  const times = useMemo(
    () => getSunTimes(currentTime, center[1], center[0]),
    [currentTime, center],
  );

  const isUp = useMemo(
    () => isSunUp(currentTime, center[1], center[0]),
    [currentTime, center],
  );

  return { position, times, isUp };
}
