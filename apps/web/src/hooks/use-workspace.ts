import { useParams } from "react-router-dom";
import { getWorkspaceBySlug, WORKSPACES, type Workspace } from "@nv/domain";

import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Resolves the active workspace from the route (`/w/[workspace]/...`).
 * Reads from the workspace store (config + user-created), falling back to the
 * built-in config and finally the first workspace.
 */
export function useWorkspace(): Workspace {
  const params = useParams<{ workspace?: string }>();
  const slug = params?.workspace;
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  return (
    (slug ? workspaces.find((w) => w.slug === slug) : undefined) ??
    (slug ? getWorkspaceBySlug(slug) : undefined) ??
    workspaces[0] ??
    WORKSPACES[0]!
  );
}

export function useWorkspaces(): Workspace[] {
  return useWorkspaceStore((s) => s.workspaces);
}
