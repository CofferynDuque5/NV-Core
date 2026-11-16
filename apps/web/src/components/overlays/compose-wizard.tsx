import * as React from "react";

import { useUiStore } from "@/stores/ui-store";

// The campaign form is large: load it the first time «Crear» opens it, not
// with every page of the panel.
const CampaignFormDialog = React.lazy(() =>
  import("@/components/entities/campaign-form-dialog").then((m) => ({ default: m.CampaignFormDialog })),
);

/**
 * «Crear › Enviar mensaje masivo»: opens the same campaign form as Campañas,
 * so a mass message gets real groups, content, schedule and the same checks
 * (no empty steps to click through).
 */
export function ComposeWizard() {
  const open = useUiStore((s) => s.composeOpen);
  const close = useUiStore((s) => s.closeCompose);
  const [used, setUsed] = React.useState(false);
  React.useEffect(() => {
    if (open) setUsed(true);
  }, [open]);
  if (!open && !used) return null;
  return (
    <React.Suspense fallback={null}>
      <CampaignFormDialog open={open} onOpenChange={(v) => (v ? undefined : close())} />
    </React.Suspense>
  );
}
