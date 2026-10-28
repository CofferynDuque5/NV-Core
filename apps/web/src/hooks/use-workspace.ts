import { useParams } from "react-router-dom";
import { MODULE_IDS, getWorkspaceBySlug, WORKSPACES, type Workspace } from "@nv/domain";

import { useWorkspaceStore } from "@/stores/workspace-store";

/** Stand-in for a brand whose details haven't loaded yet: same slug, so every query hits the right brand. */
function placeholder(slug: string): Workspace {
  return {
    id: slug,
    slug,
    name: slug,
    kind: "creative",
    accent: "#5F86F2",
    initials: slug.slice(0, 2).toUpperCase(),
    enabledModules: [...MODULE_IDS],
  };
}

/**
 * Resolves the active workspace from the route (`/w/[workspace]/...`).
 * Reads from the workspace store (config + user-created), then the built-in
 * config. A brand created by the user that the store hasn't loaded yet keeps
 * its own slug — never another brand's, or every call would go to a brand
 * the user doesn't belong to (403 on contacts, inbox, notifications…).
 */
export function useWorkspace(): Workspace {
  const params = useParams<{ workspace?: string }>();
  const slug = params?.workspace;
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  if (slug) return workspaces.find((w) => w.slug === slug) ?? getWorkspaceBySlug(slug) ?? placeholder(slug);
  return workspaces[0] ?? WORKSPACES[0]!;
}

export function useWorkspaces(): Workspace[] {
  return useWorkspaceStore((s) => s.workspaces);
}
