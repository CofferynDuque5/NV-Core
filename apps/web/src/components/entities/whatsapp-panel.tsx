
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { Loader2, Plug, QrCode, RefreshCw, Smartphone, Unplug } from "lucide-react";
import type { WhatsappStatus } from "@nv/domain";

import { API_URL } from "@/lib/env";
import { relativeTime } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStatus } from "@/hooks/use-domain-data";
import {
  useWhatsappConnect,
  useWhatsappDisconnect,
  useWhatsappReconnect,
  useWhatsappSync,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

const STATUS_META: Record<WhatsappStatus["status"], { label: string; dot: string }> = {
  connected: { label: "Conectado", dot: "bg-state-success" },
  connecting: { label: "Conectando…", dot: "bg-state-warning" },
  qr: { label: "Escanea el QR", dot: "bg-state-warning" },
  disconnected: { label: "Desconectado", dot: "bg-ink-faint" },
};

export function WhatsAppPanel() {
  const ws = useWorkspace();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const statusQuery = useWhatsappStatus();
  const connect = useWhatsappConnect();
  const reconnect = useWhatsappReconnect();
  const disconnect = useWhatsappDisconnect();
  const sync = useWhatsappSync();
  const confirm = useConfirm();
  const [qr, setQr] = React.useState<string | null>(null);

  const status = statusQuery.data;
  const state = status?.status ?? "disconnected";

  // Live QR + status over Socket.IO.
  React.useEffect(() => {
    if (!API_URL || !token) return;
    const socket: Socket = io(`${API_URL}/whatsapp`, { transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("subscribe", { workspace: ws.id, token }));
    socket.on("qr", (payload: { dataUrl: string }) => setQr(payload.dataUrl));
    socket.on("status", (s: WhatsappStatus) => {
      qc.setQueryData([ws.id, "whatsapp", "status"], s);
      if (s.status === "connected" || s.status === "disconnected") setQr(null);
    });
    return () => {
      socket.disconnect();
    };
  }, [ws.id, token, qc]);

  async function onDisconnect() {
    const ok = await confirm({
      title: "Desconectar WhatsApp",
      description: "Se cerrará la sesión y tendrás que volver a escanear el QR.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (ok) {
      setQr(null);
      disconnect.mutate();
    }
  }

  const showQr = state === "qr" && qr;

  return (
    <Panel>
      <PanelHeader
        title="WhatsApp"
        description="Conexión directa con Baileys. Escanea el QR una vez; la sesión se guarda."
      />
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_auto]">
        {/* Status */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${STATUS_META[state].dot}`} />
            <span className="text-sm font-semibold text-ink-bright">{STATUS_META[state].label}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Proveedor" value="Baileys" />
            <Field label="Número" value={status?.number ?? "—"} />
            <Field label="Última conexión" value={relativeTime(status?.lastConnectionAt ?? null)} />
            <Field label="Grupos" value={String(status?.groupsCount ?? 0)} />
            <Field label="Contactos" value={String(status?.contactsCount ?? 0)} />
          </dl>

          {status?.error ? (
            <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
              {status.error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {state === "disconnected" ? (
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                Conectar
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending || state !== "connected"}
                >
                  {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Sincronizar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reconnect.mutate()}
                  disabled={reconnect.isPending}
                >
                  {reconnect.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Reconectar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDisconnect}
                  disabled={disconnect.isPending}
                  className="text-state-danger hover:bg-state-danger/10"
                >
                  {disconnect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* QR / illustration */}
        <div className="grid w-full place-items-center rounded-xl border border-line-soft bg-panel-raised p-4 md:w-56">
          {showQr ? (
            <img src={qr} alt="Código QR de WhatsApp" className="size-44 rounded-lg bg-white p-1" />
          ) : state === "connected" ? (
            <div className="flex flex-col items-center gap-2 text-center text-ink-muted">
              <Smartphone className="size-10 text-state-success" />
              <span className="text-xs">Vinculado a tu teléfono</span>
            </div>
          ) : state === "connecting" ? (
            <div className="flex flex-col items-center gap-2 text-center text-ink-muted">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-xs">Generando QR…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-ink-faint">
              <QrCode className="size-10" />
              <span className="text-xs">Pulsa «Conectar» para generar el QR</span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
