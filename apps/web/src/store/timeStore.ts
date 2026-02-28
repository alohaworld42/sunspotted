import { create } from "zustand";

interface TimeState {
  currentTime: Date;
  isLive: boolean;
  isPlaying: boolean;
  playSpeed: number;
  setTime: (time: Date) => void;
  setLive: (live: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setPlaySpeed: (speed: number) => void;
  resetToNow: () => void;
}

export const useTimeStore = create<TimeState>((set) => ({
  currentTime: new Date(),
  isLive: true,
  isPlaying: false,
  playSpeed: 1,

  setTime: (time) => set({ currentTime: time, isLive: false }),
  setLive: (live) => set({ isLive: live, currentTime: live ? new Date() : undefined }),
  setPlaying: (playing) => set({ isPlaying: playing, isLive: false }),
  setPlaySpeed: (speed) => set({ playSpeed: speed }),
  resetToNow: () => set({ currentTime: new Date(), isLive: true, isPlaying: false }),
}));
