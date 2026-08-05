
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
  setWorkspaces: (workspaces) => set({ workspaces: workspaces.length ? workspaces : WORKSPACES }),
}));
