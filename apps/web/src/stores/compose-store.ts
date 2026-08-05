
import { create } from "zustand";

/** Steps of the mass-message compose wizard (matches the design). */
export const COMPOSE_STEPS = [
  { id: "audience", label: "Audiencia" },
  { id: "content", label: "Contenido" },
  { id: "attach", label: "Adjuntar" },
  { id: "schedule", label: "Programación" },
  { id: "review", label: "Revisar y enviar" },
] as const;

interface ComposeState {
  step: number;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  reset: () => void;
}

export const useComposeStore = create<ComposeState>((set) => ({
  step: 0,
  next: () => set((s) => ({ step: Math.min(s.step + 1, COMPOSE_STEPS.length - 1) })),
  prev: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
  goTo: (i) => set({ step: i }),
  reset: () => set({ step: 0 }),
}));
