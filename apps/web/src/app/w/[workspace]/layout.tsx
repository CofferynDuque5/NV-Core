import { notFound } from "next/navigation";
import { getWorkspaceBySlug, WORKSPACES } from "@nv/domain";

import { AppShell } from "@/components/shell/app-shell";

/** Pre-render every workspace (required for static export). */
export function generateStaticParams() {
  return WORKSPACES.map((w) => ({ workspace: w.slug }));
}

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (!getWorkspaceBySlug(workspace)) notFound();

  return <AppShell>{children}</AppShell>;
}
