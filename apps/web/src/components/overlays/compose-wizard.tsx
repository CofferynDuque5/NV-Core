import { useUiStore } from "@/stores/ui-store";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

/**
 * «Crear › Enviar mensaje masivo»: opens the same campaign form as Campañas,
 * so a mass message gets real groups, content, schedule and the same checks
 * (no empty steps to click through).
 */
export function ComposeWizard() {
  const open = useUiStore((s) => s.composeOpen);
  const close = useUiStore((s) => s.closeCompose);
  return <CampaignFormDialog open={open} onOpenChange={(v) => (v ? undefined : close())} />;
}
