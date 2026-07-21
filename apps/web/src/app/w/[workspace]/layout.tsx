import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@nv/domain";

import { AppShell } from "@/components/shell/app-shell";

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
