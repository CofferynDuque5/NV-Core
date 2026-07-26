"use client";

import * as React from "react";
import { CHANNEL_LIST, type ChannelId, type Connection } from "@nv/domain";
import { Loader2, Plug, Radio, Trash2 } from "lucide-react";

import { useConnections } from "@/hooks/use-domain-data";
import { useDeleteConnection } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { StatusDot } from "@/components/common/status-dot";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/entities/connection-dialog";
import { GoogleConnectCard } from "@/components/entities/google-connect-card";

const STATUS_TEXT = { ok: "Conectado", warn: "Con advertencias", down: "Caído" } as const;

export default function ConexionesPage() {
  const connections = useConnections();
  const del = useDeleteConnection();
  const confirm = useConfirm();
  const [dialogChannel, setDialogChannel] = React.useState<ChannelId | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const byChannel = new Map<ChannelId, Connection>();
  for (const c of connections.data ?? []) byChannel.set(c.channel, c);

  async function remove(id: string, label: string) {
    const ok = await confirm({
      title: "Eliminar conexión",
      description: `¿Desconectar ${label}?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    del.mutate(id, { onSettled: () => setDeletingId(null) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proveedores & OAuth"
        title="Conexiones"
        description="Conecta tus canales para publicar y recibir mensajes."
      />

      <GoogleConnectCard />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHANNEL_LIST.map((ch) => {
          const conn = byChannel.get(ch.id);
          return (
            <div key={ch.id} className="nv-panel flex items-center gap-3 p-4">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold"
                style={{ background: `${ch.color}22`, color: ch.color }}
              >
                {ch.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-bright">{ch.name}</div>
                {conn ? (
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <StatusDot status={conn.status} /> {conn.handle || STATUS_TEXT[conn.status]}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <StatusDot status="down" /> Sin conectar
                  </div>
                )}
              </div>
              {conn ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setDialogChannel(ch.id)}>
                    Reconectar
                  </Button>
                  <button
                    onClick={() => remove(conn.id, ch.name)}
                    disabled={deletingId === conn.id}
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                    title="Eliminar"
                  >
                    {deletingId === conn.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setDialogChannel(ch.id)}>
                  Conectar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Panel>
        <PanelHeader title="Registro OAuth & webhooks" />
        <div className="p-4">
          <EmptyState
            icon={Radio}
            title="Sin actividad OAuth"
            description="Los eventos de conexión, tokens y webhooks aparecerán aquí una vez conectes un proveedor."
            compact
          />
        </div>
      </Panel>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Plug className="size-3.5" /> El flujo OAuth real (Meta Graph, Google, Telegram…) se
        habilitará en la fase de proveedores.
      </p>

      <ConnectionDialog
        channel={dialogChannel}
        open={dialogChannel !== null}
        onOpenChange={(v) => {
          if (!v) setDialogChannel(null);
        }}
      />
    </div>
  );
}
