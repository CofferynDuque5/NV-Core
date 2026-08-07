import { create } from "zustand";

import { getTour, markTourCompleted } from "@/lib/tours";

interface TourState {
  activeTourId: string | null;
  stepIndex: number;
  start: (id: string) => void;
  next: () => void;
  prev: () => void;
  /** Stop the tour; pass completed=true to remember it as done. */
  stop: (completed?: boolean) => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  activeTourId: null,
  stepIndex: 0,
  start: (id) => {
    if (getTour(id)) set({ activeTourId: id, stepIndex: 0 });
  },
  next: () => {
    const { activeTourId, stepIndex } = get();
    if (!activeTourId) return;
    const tour = getTour(activeTourId);
    if (!tour) return set({ activeTourId: null, stepIndex: 0 });
    if (stepIndex >= tour.steps.length - 1) {
      markTourCompleted(activeTourId);
      return set({ activeTourId: null, stepIndex: 0 });
    }
    set({ stepIndex: stepIndex + 1 });
  },
  prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
  stop: (completed = false) => {
    const { activeTourId } = get();
    if (completed && activeTourId) markTourCompleted(activeTourId);
    set({ activeTourId: null, stepIndex: 0 });
  },
}));
