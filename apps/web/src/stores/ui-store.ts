
import { create } from "zustand";

export type DrawerKind = "campaign" | "group" | "post" | "connection";

interface DrawerState {
  kind: DrawerKind;
  id: string;
}

interface UiState {
  /** Sidebar collapsed/expanded. */
  navCollapsed: boolean;
  toggleNav: () => void;
  setNavCollapsed: (v: boolean) => void;

  /** Mobile nav drawer. */
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  /** Notifications panel. */
  notificationsOpen: boolean;
  toggleNotifications: () => void;
  setNotificationsOpen: (v: boolean) => void;

  /** Compose (mass message) wizard. */
  composeOpen: boolean;
  openCompose: () => void;
  closeCompose: () => void;

  /** In-app feedback dialog. */
  feedbackOpen: boolean;
  openFeedback: () => void;
  setFeedbackOpen: (v: boolean) => void;

  /** Entity drawer (single, reused for all entities). */
  drawer: DrawerState | null;
  openDrawer: (kind: DrawerKind, id: string) => void;
  closeDrawer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  navCollapsed: false,
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  setNavCollapsed: (v) => set({ navCollapsed: v }),

  mobileNavOpen: false,
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  notificationsOpen: false,
  toggleNotifications: () => set((s) => ({ notificationsOpen: !s.notificationsOpen })),
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),

  composeOpen: false,
  openCompose: () => set({ composeOpen: true }),
  closeCompose: () => set({ composeOpen: false }),

  feedbackOpen: false,
  openFeedback: () => set({ feedbackOpen: true }),
  setFeedbackOpen: (v) => set({ feedbackOpen: v }),

  drawer: null,
  openDrawer: (kind, id) => set({ drawer: { kind, id } }),
  closeDrawer: () => set({ drawer: null }),
}));
