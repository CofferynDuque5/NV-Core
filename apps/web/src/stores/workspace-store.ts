
import { create } from "zustand";
import { WORKSPACES, type Workspace } from "@nv/domain";

/**
 * Holds the resolved workspace list. Seeded with the built-in config workspaces
 * so resolution is synchronous from the first render, then hydrated with the
 * merged (config + user-created) list from the API.
 */
interface WorkspaceState {
  workspaces: Workspace[];
  setWorkspaces: (workspaces: Workspace[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: WORKSPACES,
  // Use the list the backend returns *as-is* — including an empty list, which
  // means "this user isn't a member of any workspace". Falling back to the
  // built-in config here would show workspaces the user can't actually open
  // (every API call 403s), which reads as "everything is broken". The demo
  // adapter returns the built-in list, so demo mode still shows them.
  setWorkspaces: (workspaces) => set({ workspaces }),
}));
