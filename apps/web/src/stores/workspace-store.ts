import { create } from "zustand";
import { type Workspace } from "@nv/domain";

/**
 * Holds the resolved workspace list, hydrated from the API on mount. Starts
 * EMPTY on purpose: in backend mode a user must only ever see the workspaces
 * they belong to — seeding the built-in config here would leak demo workspaces
 * to every account. Demo mode still shows the built-ins because the empty
 * adapter's `workspaces.list()` returns them, which hydrates the store.
 */
interface WorkspaceState {
  workspaces: Workspace[];
  setWorkspaces: (workspaces: Workspace[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  // Use the list the backend returns *as-is* — including an empty list, which
  // means "this user isn't a member of any workspace". Falling back to the
  // built-in config here would show workspaces the user can't actually open
  // (every API call 403s), which reads as "everything is broken". The demo
  // adapter returns the built-in list, so demo mode still shows them.
  setWorkspaces: (workspaces) => set({ workspaces }),
}));
