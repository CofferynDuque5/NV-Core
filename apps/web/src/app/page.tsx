"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_WORKSPACE_SLUG } from "@nv/domain";

/**
 * Client-side redirect to the default workspace dashboard.
 * Kept client-side so the app works both server-rendered and as a fully
 * static export (Live Server / plain file host).
 */
export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace(`/w/${DEFAULT_WORKSPACE_SLUG}/dashboard`);
  }, [router]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-ink-muted">
      <div className="flex items-center gap-3 text-sm">
        <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
        Cargando NV Core…
      </div>
    </div>
  );
}
