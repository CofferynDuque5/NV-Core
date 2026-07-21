"use client";

import { useParams } from "next/navigation";
import { getWorkspaceBySlug, WORKSPACES, type Workspace } from "@nv/domain";

/**
 * Resolves the active workspace from the route (`/w/[workspace]/...`).
 * Falls back to the first workspace if the slug is unknown.
 */
export function useWorkspace(): Workspace {
  const params = useParams<{ workspace?: string }>();
  const slug = params?.workspace;
  return (slug ? getWorkspaceBySlug(slug) : undefined) ?? WORKSPACES[0]!;
}

export function useWorkspaces(): Workspace[] {
  return WORKSPACES;
}
