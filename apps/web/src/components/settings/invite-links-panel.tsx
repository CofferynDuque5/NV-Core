import * as React from "react";
import { ROLES, type CreatedInviteLink, type Role } from "@nv/domain";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { useInviteLinks } from "@/hooks/use-domain-data";
import { useCreateInviteLink, useRevokeInviteLink } from "@/hooks/use-domain-mutations";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

const LINK_ROLES = ROLES.filter((r) => r !== "Owner");

const ROLE_HELP: Record<Role, string> = {
  Owner: "",
  Admin: "ve y cambia todo, y gestiona el equipo",
  Editor: "ve y edita campañas, contactos e inbox",
  Visor: "solo ve las campañas y los datos, sin cambiar nada",
};

/** Shareable links that let teammates join this brand with a fixed role. */
export function InviteLinksPanel() {
  const links = useInviteLinks();
  const create = useCreateInviteLink();
  const revoke = useRevokeInviteLink();
  const [role, setRole] = React.useState<Role>("Editor");
  const [days, setDays] = React.useState(7);
  const [created, setCreated] = React.useState<CreatedInviteLink | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Enlace copiado. Pégalo en WhatsApp o donde quieras.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  function onCreate() {
    create.mutate({ role, days }, { onSuccess: (link) => setCreated(link) });
  }

  const active = links.data ?? [];

  return (
    <Panel>
      <PanelHeader
        title="Invitar por enlace"
        description="Crea un enlace y compártelo con tu equipo. Quien lo abra y entre con su cuenta verá las mismas campañas de esta marca."
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-ink-muted">
            <span>Entran como</span>
            <select
              data-testid="invite-link-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="block h-9 rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink"
            >
              {LINK_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-muted">
            <span>Dura</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="block h-9 rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink"
            >
              <option value={1}>1 día</option>
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
            </select>
          </label>
          <Button size="sm" onClick={onCreate} disabled={create.isPending} data-testid="invite-link-create">
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Crear enlace
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          {role}: {ROLE_HELP[role]}.
        </p>

        {created ? (
          <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="text-xs text-ink-muted">
              Copia el enlace ahora: por seguridad solo se muestra esta vez. Si lo pierdes, crea otro.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                data-testid="invite-link-url"
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-soft bg-panel px-2 text-xs text-ink"
              />
              <Button size="sm" variant="outline" onClick={() => copy(created.url)}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copiar
              </Button>
            </div>
          </div>
        ) : null}

        {active.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line-soft">
            {active.map((l) => (
              <li key={l.id} data-testid="invite-link-row" className="flex items-center gap-3 px-3 py-2 text-xs">
                <Link2 className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 text-ink">
                  Enlace como <strong>{l.role}</strong>
                  {l.createdByName ? ` · creado por ${l.createdByName}` : ""} · usado {l.uses}
                  {l.maxUses != null ? ` de ${l.maxUses}` : ""} {l.uses === 1 ? "vez" : "veces"} · caduca el{" "}
                  {new Date(l.expiresAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                </span>
                <button
                  onClick={() => revoke.mutate(l.id)}
                  disabled={revoke.isPending}
                  title="Desactivar enlace"
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}
