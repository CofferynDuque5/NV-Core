"use client";

import { CHANNEL_LIST } from "@nv/domain";
import { Plug, Radio } from "lucide-react";

import { useConnections } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { StatusDot } from "@/components/common/status-dot";
import { Button } from "@/components/ui/button";

export default function ConexionesPage() {
  const connections = useConnections();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proveedores & OAuth"
        title="Conexiones"
        description="Conecta tus canales para publicar y recibir mensajes."
      />

      {/* Connectable providers — structural catalog; no connection is active yet */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHANNEL_LIST.map((ch) => (
          <div key={ch.id} className="nv-panel flex items-center gap-3 p-4">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold"
              style={{ background: `${ch.color}22`, color: ch.color }}
            >
              {ch.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-bright">{ch.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <StatusDot status="down" /> Sin conectar
              </div>
            </div>
            <Button variant="secondary" size="sm">
              Conectar
            </Button>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader title="Registro OAuth & webhooks" />
        <div className="p-4">
          {connections.isLoading ? null : (
            <EmptyState
              icon={Radio}
              title="Sin actividad OAuth"
              description="Los eventos de conexión, tokens y webhooks aparecerán aquí una vez conectes un proveedor."
              compact
            />
          )}
        </div>
      </Panel>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Plug className="size-3.5" /> El flujo OAuth real (Meta Graph, Google, Telegram…) se
        habilitará en la fase de backend.
      </p>
    </div>
  );
}
