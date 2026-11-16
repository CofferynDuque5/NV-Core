import * as React from "react";
import type { TelegramStatus } from "@nv/domain";
import { KeyRound, Loader2, Pencil, Plug, Plus, QrCode, RefreshCw, Send, Trash2, Unplug } from "lucide-react";

import { useTelegramLines } from "@/hooks/use-domain-data";
import {
  useAddTelegramLine,
  useRemoveTelegramLine,
  useRenameTelegramLine,
  useTelegramLineAction,
  useTelegramLinePassword,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { relativeTime } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_LINES = 5;

const STATE_LABEL: Record<TelegramStatus["status"], { label: string; dot: string }> = {
  connected: { label: "Conectada", dot: "bg-state-success" },
  connecting: { label: "Conectando…", dot: "bg-state-warning" },
  qr: { label: "Escanea el QR", dot: "bg-state-warning" },
  password: { label: "Falta la contraseña 2FA", dot: "bg-state-warning" },
  disconnected: { label: "Desconectada", dot: "bg-ink-faint" },
};

/** Extra Telegram accounts of the brand (the main one is the panel above). */
export function TelegramLinesPanel() {
  const lines = useTelegramLines();
  const add = useAddTelegramLine();
  const all = lines.data ?? [];
  const extras = all.filter((l) => (l.line ?? 1) > 1);

  function onAdd() {
    const label = window.prompt("¿Cómo quieres llamar a esta cuenta? (por ejemplo «Ventas» o «Soporte»)", "");
    if (label === null) return;
    add.mutate(label.trim() || undefined);
  }

  return (
    <Panel>
      <PanelHeader
        title="Más cuentas de Telegram"
        description="Conecta otras cuentas de Telegram a esta misma marca, igual que los números de WhatsApp. Cada cuenta envía a sus propios grupos y canales, y los chats del Inbox se responden desde la cuenta a la que te escribieron."
        action={
          <Button size="sm" onClick={onAdd} disabled={add.isPending || all.length >= MAX_LINES} data-testid="tg-line-add">
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Agregar cuenta
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {extras.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Solo está la cuenta principal. Pulsa «Agregar cuenta» y escanea el QR desde Telegram del otro teléfono
            (Ajustes → Dispositivos → Vincular dispositivo). Hasta {MAX_LINES} cuentas por marca.
          </p>
        ) : (
          extras.map((l) => <TgLineRow key={l.line} status={l} />)
        )}
      </div>
    </Panel>
  );
}

function TgLineRow({ status }: { status: TelegramStatus }) {
  const line = status.line ?? 1;
  const action = useTelegramLineAction();
  const rename = useRenameTelegramLine();
  const remove = useRemoveTelegramLine();
  const sendPassword = useTelegramLinePassword();
  const confirm = useConfirm();
  const [password, setPassword] = React.useState("");
  const state = status.status;
  const busy = action.isPending || remove.isPending;
  const run = (a: "connect" | "disconnect" | "sync") => action.mutate({ line, action: a });

  async function onRemove() {
    const ok = await confirm({
      title: "Quitar esta cuenta",
      description:
        "Se cierra su sesión y se quitan sus grupos y canales del panel. Sus chats se quedan en el Inbox y se responderán desde la cuenta principal.",
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (ok) remove.mutate(line);
  }

  function onRename() {
    const label = window.prompt("Nombre de la cuenta", status.label ?? "");
    if (label === null) return;
    rename.mutate({ line, label });
  }

  return (
    <div data-testid="tg-line" className="grid gap-3 rounded-lg border border-line-soft p-3 md:grid-cols-[1fr_auto]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`size-2.5 rounded-full ${STATE_LABEL[state].dot}`} />
          <span className="text-sm font-semibold text-ink-bright">{status.label || `Cuenta ${line}`}</span>
          <button
            type="button"
            onClick={onRename}
            aria-label="Cambiar nombre"
            className="rounded p-1 text-ink-faint hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <span className="text-xs text-ink-muted">{STATE_LABEL[state].label}</span>
        </div>
        <p className="text-xs text-ink-muted">
          {status.username ? `@${status.username}` : status.phone ?? "Sin vincular"} · {status.groupsCount} grupos y
          canales · última conexión {relativeTime(status.lastConnectionAt ?? null)}
        </p>
        {status.error ? <p className="text-xs text-state-danger">{status.error}</p> : null}
        {state === "password" ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (password) sendPassword.mutate({ line, password }, { onSuccess: () => setPassword("") });
            }}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña de verificación en dos pasos"
              aria-label="Contraseña de verificación en dos pasos"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 max-w-xs"
            />
            <Button size="sm" type="submit" disabled={!password || sendPassword.isPending}>
              {sendPassword.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Enviar
            </Button>
          </form>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {state === "disconnected" ? (
            <Button size="sm" onClick={() => run("connect")} disabled={busy}>
              <Plug className="size-4" /> Conectar
            </Button>
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
          <img src={status.qr} alt={`Código QR de la cuenta ${line}`} className="size-36 rounded bg-white p-1" />
        ) : state === "connected" ? (
          <Send className="size-8 text-state-success" />
        ) : state === "connecting" ? (
          <Loader2 className="size-6 animate-spin text-ink-muted" />
        ) : (
          <QrCode className="size-8 text-ink-faint" />
        )}
      </div>
    </div>
  );
}
