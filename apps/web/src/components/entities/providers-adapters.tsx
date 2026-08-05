import * as React from "react";
import { Loader2, Plug, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { API_URL, isBackendConfigured } from "@/lib/env";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";

interface ProviderView {
  id: string;
  label: string;
  activeAdapter: string;
  defaultAdapter: string;
  adapters: { id: string; label: string }[];
}

/**
 * Provider + Adapter selector (Conexiones module).
 *
 * Lets an Owner/Admin pick the ACTIVE adapter for each provider — e.g. WhatsApp
 * via Baileys or Cloud API, Facebook/Instagram via Meta Graph or browser
 * automation. Pure REST calls to the backend ProviderManager; no business logic
 * lives here.
 */
export function ProvidersAdapters() {
  const ws = useWorkspace();
  const token = useAuthStore((s) => s.token);
  const [providers, setProviders] = React.useState<ProviderView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!isBackendConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${ws.id}/providers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(String(res.status));
      setProviders((await res.json()) as ProviderView[]);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [ws.id, token]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function select(provider: string, adapter: string) {
    setSaving(provider);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${ws.id}/providers/${provider}/adapter`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ adapter }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const updated = (await res.json()) as ProviderView;
      setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(`Adapter activo de ${updated.label}: ${adapter}`);
    } catch {
      toast.error("No se pudo cambiar el adapter (¿permisos de Owner/Admin?).");
    } finally {
      setSaving(null);
    }
  }

  if (!isBackendConfigured()) {
    return (
      <Panel>
        <PanelHeader title="Proveedores & Adapters" description="Selecciona el adapter activo por proveedor." />
        <EmptyState
          icon={Plug}
          title="Backend no configurado"
          description="Configura VITE_API_URL para gestionar los adapters."
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Proveedores & Adapters"
        description="Elige el adapter activo de cada proveedor. El resto del sistema usa el ProviderManager: cambiar de proveedor no toca el resto del código."
      />
      {loading ? (
        <div className="grid place-items-center py-10 text-ink-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <EmptyState icon={Plug} title="Sin proveedores" description="No se pudieron cargar los proveedores." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className="rounded-xl border border-line-soft bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-bright">{p.label}</span>
                {p.activeAdapter === p.defaultAdapter ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                    <ShieldCheck className="size-3.5" /> por defecto
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-brand">
                    <ShieldAlert className="size-3.5" /> personalizado
                  </span>
                )}
              </div>
              <label className="mb-1 block text-[11px] font-medium text-ink-muted">Adapter activo</label>
              <div className="flex items-center gap-2">
                <select
                  value={p.activeAdapter}
                  disabled={saving === p.id}
                  onChange={(e) => select(p.id, e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  {p.adapters.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                {saving === p.id ? <Loader2 className="size-4 animate-spin text-ink-muted" /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
