
import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useGoogleStatus } from "@/hooks/use-domain-data";
import { useGoogleConnect, useGoogleDisconnect } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

export function GoogleConnectCard() {
  const status = useGoogleStatus();
  const connect = useGoogleConnect();
  const disconnect = useGoogleDisconnect();
  const confirm = useConfirm();

  // Surface the OAuth callback result once (read client-side to keep the page SSG-safe).
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google");
    if (!result) return;
    if (result === "connected") toast.success("Cuenta de Google conectada");
    else if (result === "error") toast.error("No se pudo conectar Google. Inténtalo de nuevo.");
    // Clean the query so a refresh doesn't re-toast.
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const data = status.data;

  async function onDisconnect() {
    const ok = await confirm({
      title: "Desconectar Google",
      description: "Se eliminarán los tokens de acceso de este workspace.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (ok) disconnect.mutate();
  }

  return (
    <Panel>
      <PanelHeader
        title="Google Workspace"
        description="Conecta Google para sincronizar Calendar y Drive."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ background: "hsl(4 70% 50%)" }}
          >
            G
          </span>
          <div>
            {status.isLoading ? (
              <div className="h-4 w-40 animate-pulse rounded bg-panel-raised" />
            ) : !data?.configured ? (
              <>
                <div className="text-sm font-semibold text-ink-bright">No configurado</div>
                <div className="text-xs text-ink-muted">
                  Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el backend.
                </div>
              </>
            ) : data.connected ? (
              <>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-bright">
                  <CheckCircle2 className="size-4 text-state-success" /> Conectado
                </div>
                <div className="text-xs text-ink-muted">{data.email ?? "Cuenta de Google"}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-ink-bright">Sin conectar</div>
                <div className="text-xs text-ink-muted">
                  Autoriza el acceso a tu cuenta de Google.
                </div>
              </>
            )}
          </div>
        </div>

        {data?.configured ? (
          data.connected ? (
            <Button variant="outline" onClick={onDisconnect} disabled={disconnect.isPending}>
              {disconnect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Desconectar
            </Button>
          ) : (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Conectar con Google
            </Button>
          )
        ) : null}
      </div>
    </Panel>
  );
}
