"use client";

import { Info } from "lucide-react";

import { useUiStore } from "@/stores/ui-store";
import { EmptyState } from "@/components/common/empty-state";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const TITLES: Record<string, string> = {
  campaign: "Detalle de campaña",
  group: "Detalle de grupo",
  post: "Detalle de publicación",
  connection: "Configuración de conexión",
};

/**
 * Single reusable drawer for every entity (campaign / group / post /
 * connection) — merged from the design's four separate drawers into one.
 * Renders an empty detail until data exists.
 */
export function EntityDrawer() {
  const drawer = useUiStore((s) => s.drawer);
  const close = useUiStore((s) => s.closeDrawer);

  return (
    <Sheet open={drawer !== null} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{drawer ? TITLES[drawer.kind] : ""}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <EmptyState
            icon={Info}
            title="Sin información todavía"
            description="Los detalles aparecerán aquí cuando exista este registro. Conecta el backend para poblar esta vista."
            compact
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
