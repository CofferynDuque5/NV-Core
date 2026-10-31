import type { WhatsappStatus } from "@nv/domain";
import { Loader2, Pencil, Plug, Plus, QrCode, RefreshCw, Smartphone, Trash2, Unplug } from "lucide-react";

import { useWhatsappLines } from "@/hooks/use-domain-data";
import {
  useAddWhatsappLine,
  useRemoveWhatsappLine,
  useRenameWhatsappLine,
  useWhatsappLineAction,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { relativeTime } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

const MAX_LINES = 5;

const STATE_LABEL: Record<WhatsappStatus["status"], { label: string; dot: string }> = {
  connected: { label: "Conectado", dot: "bg-state-success" },
  connecting: { label: "Conectando…", dot: "bg-state-warning" },
  qr: { label: "Escanea el QR", dot: "bg-state-warning" },
  disconnected: { label: "Desconectado", dot: "bg-ink-faint" },
};

/** Extra WhatsApp numbers of the brand (the main one is the panel above). */
export function WhatsappLinesPanel() {
  const lines = useWhatsappLines();
  const add = useAddWhatsappLine();
  const all = lines.data ?? [];
  const extras = all.filter((l) => (l.line ?? 1) > 1);

  function onAdd() {
    const label = window.prompt("¿Cómo quieres llamar a este número? (por ejemplo «Ventas» o «Soporte»)", "");
    if (label === null) return;
    add.mutate(label.trim() || undefined);
  }

  return (
    <Panel>
      <PanelHeader
        title="Más números de WhatsApp"
        description="Conecta otros WhatsApp a esta misma marca. Cada número envía a sus propios grupos, y los chats del Inbox se responden desde el número al que te escribieron."
        action={
          <Button size="sm" onClick={onAdd} disabled={add.isPending || all.length >= MAX_LINES} data-testid="wa-line-add">
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Agregar número
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {extras.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Solo está el número principal. Pulsa «Agregar número» y escanea el QR con el otro teléfono (hasta {MAX_LINES}{" "}
            números por marca).
          </p>
        ) : (
          extras.map((l) => <LineRow key={l.line} status={l} />)
        )}
      </div>
    </Panel>
  );
}

function LineRow({ status }: { status: WhatsappStatus }) {
  const line = status.line ?? 1;
  const action = useWhatsappLineAction();
  const rename = useRenameWhatsappLine();
  const remove = useRemoveWhatsappLine();
  const confirm = useConfirm();
  const state = status.status;
  const busy = action.isPending || remove.isPending;
  const run = (a: "connect" | "relink" | "disconnect" | "sync") => action.mutate({ line, action: a });

  async function onRemove() {
    const ok = await confirm({
      title: "Quitar este número",
      description:
        "Se cierra su sesión y se quitan sus grupos del panel. Sus chats se quedan en el Inbox y se responderán desde el número principal.",
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (ok) remove.mutate(line);
  }

  function onRename() {
    const label = window.prompt("Nombre del número", status.label ?? "");
    if (label === null) return;
    rename.mutate({ line, label });
  }

  return (
    <div data-testid="wa-line" className="grid gap-3 rounded-lg border border-line-soft p-3 md:grid-cols-[1fr_auto]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`size-2.5 rounded-full ${STATE_LABEL[state].dot}`} />
          <span className="text-sm font-semibold text-ink-bright">{status.label || `Número ${line}`}</span>
          <button onClick={onRename} title="Cambiar nombre" className="rounded p-1 text-ink-faint hover:text-ink">
            <Pencil className="size-3.5" />
          </button>
          <span className="text-xs text-ink-muted">{STATE_LABEL[state].label}</span>
        </div>
        <p className="text-xs text-ink-muted">
          {status.number ?? "Sin vincular"} · {status.groupsCount} grupos · última conexión{" "}
          {relativeTime(status.lastConnectionAt ?? null)}
        </p>
        {status.error ? <p className="text-xs text-state-danger">{status.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {state === "disconnected" ? (
            <>
              <Button size="sm" onClick={() => run("connect")} disabled={busy}>
                <Plug className="size-4" /> Conectar
              </Button>
              <Button size="sm" variant="outline" onClick={() => run("relink")} disabled={busy}>
                <QrCode className="size-4" /> QR nuevo
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => run("sync")} disabled={busy || state !== "connected"}>
                <RefreshCw className="size-4" /> Sincronizar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run("disconnect")} disabled={busy}>
                <Unplug className="size-4" /> Desconectar
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            disabled={busy}
            className="text-state-danger hover:bg-state-danger/10"
          >
            <Trash2 className="size-4" /> Quitar
          </Button>
        </div>
      </div>
      <div className="grid w-full place-items-center rounded-lg bg-panel-raised p-3 md:w-44">
        {state === "qr" && status.qr ? (
          <img src={status.qr} alt={`Código QR del número ${line}`} className="size-36 rounded bg-white p-1" />
        ) : state === "connected" ? (
          <Smartphone className="size-8 text-state-success" />
        ) : state === "connecting" ? (
          <Loader2 className="size-6 animate-spin text-ink-muted" />
        ) : (
          <QrCode className="size-8 text-ink-faint" />
        )}
      </div>
    </div>
  );
}
