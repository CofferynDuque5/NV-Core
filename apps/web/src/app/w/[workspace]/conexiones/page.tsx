
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionDialog } from "@/components/entities/connection-dialog";
import { GoogleConnectCard } from "@/components/entities/google-connect-card";
import { WhatsAppPanel } from "@/components/entities/whatsapp-panel";
import { SocialPublishForm } from "@/components/entities/social-publish";
import { GruposContent } from "@/components/whatsapp/grupos-content";
import { CampanasContent } from "@/components/whatsapp/campanas-content";
import { PlantillasContent } from "@/components/whatsapp/plantillas-content";
import { HistorialContent } from "@/components/whatsapp/historial-content";
import { RecomendacionesContent } from "@/components/whatsapp/recomendaciones-content";

const STATUS_TEXT = { ok: "Conectado", warn: "Con advertencias", down: "Caído" } as const;

const TABS = [
  { value: "conexion", label: "Conexión" },
  { value: "grupos", label: "Grupos" },
  { value: "campanas", label: "Campañas" },
  { value: "plantillas", label: "Plantillas" },
  { value: "historial", label: "Historial" },
  { value: "recomendaciones", label: "Recomendaciones IA" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const TAB_VALUES = new Set<string>(TABS.map((t) => t.value));

export default function ConexionesPage() {
  const [tab, setTab] = React.useState<TabValue>("conexion");

  // Restore the active tab from ?tab= on mount, and keep the URL in sync.
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && TAB_VALUES.has(param)) setTab(param as TabValue);
  }, []);

  function onTabChange(value: string) {
    const next = value as TabValue;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp · Conexiones"
        title="WhatsApp / Conexiones"
        description="Conecta WhatsApp y tus canales, y gestiona grupos, campañas, plantillas e historial desde un solo lugar."
      />

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="conexion">
          <ConexionTab />
        </TabsContent>
        <TabsContent value="grupos">
          <GruposContent showHeader={false} />
        </TabsContent>
        <TabsContent value="campanas">
          <CampanasContent showHeader={false} />
        </TabsContent>
        <TabsContent value="plantillas">
          <PlantillasContent showHeader={false} />
        </TabsContent>
        <TabsContent value="historial">
          <HistorialContent showHeader={false} />
        </TabsContent>
        <TabsContent value="recomendaciones">
          <RecomendacionesContent showHeader={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConexionTab() {
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
      <WhatsAppPanel />

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
        <PanelHeader title="Publicar ahora" />
        <div className="space-y-3 p-4">
          <p className="text-xs text-ink-faint">
            Publica directo en Facebook / Instagram vía Meta Graph API.
          </p>
          <SocialPublishForm />
        </div>
      </Panel>

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
