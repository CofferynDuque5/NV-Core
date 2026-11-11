import * as React from "react";
import { Bell, BellOff, BellRing, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { useServices } from "@/hooks/use-services";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { errText } from "@/hooks/use-domain-mutations";
import {
  playChime,
  pushState,
  setSoundEnabled,
  soundEnabled,
  subscribePush,
  unlockSound,
  unsubscribePush,
  type PushState,
} from "@/lib/inbox-alerts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PUSH_HINT: Record<PushState, string> = {
  on: "Te llegan avisos en este equipo aunque cierres el panel.",
  off: "Actívalos para que te lleguen aunque cierres el panel.",
  denied: "Bloqueaste los avisos para esta página: actívalos en el candado de la barra de direcciones.",
  unsupported: "Este navegador no recibe avisos con el panel cerrado.",
  "ios-needs-install": "En iPhone/iPad primero instala el panel («Compartir» → «Agregar a inicio») y ábrelo desde ese ícono.",
};

/** Sound, push notices and «traer nombres de mi WhatsApp», from the Inbox header. */
export function InboxAlertsMenu() {
  const svc = useServices();
  const ws = useWorkspace();
  const demo = useAuthStore((s) => s.demo);
  const [sound, setSound] = React.useState(soundEnabled);
  const [push, setPush] = React.useState<PushState>("off");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    void pushState()
      .then(setPush)
      .catch(() => setPush("unsupported"));
  }, []);
  React.useEffect(refresh, [refresh]);

  async function enablePush() {
    setBusy(true);
    try {
      const { publicKey } = await svc.push.key();
      const sub = await subscribePush(publicKey);
      await svc.push.subscribe(sub);
      toast.success("Listo: los mensajes nuevos te avisarán en este equipo aunque cierres el panel.");
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      const endpoint = await unsubscribePush();
      if (endpoint) await svc.push.unsubscribe(endpoint);
      toast.success("Avisos desactivados en este equipo.");
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function testPush() {
    try {
      const r = await svc.push.test();
      toast.success(`Aviso de prueba enviado a ${r.sent} equipo${r.sent === 1 ? "" : "s"}. Si estás aquí, minimiza el panel para verlo.`);
    } catch (err) {
      toast.error(errText(err));
    }
  }

  async function refreshNames() {
    try {
      const r = await svc.whatsapp.refreshNames(ws.id);
      toast.success(
        `Pedí los nombres a tu WhatsApp (${r.lines} número${r.lines === 1 ? "" : "s"}). En unos segundos los chats muestran el nombre con el que los guardaste.`,
      );
    } catch (err) {
      toast.error(errText(err));
    }
  }

  const BellIcon = push === "on" ? BellRing : push === "denied" ? BellOff : Bell;
  return (
    <DropdownMenu onOpenChange={(o) => o && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="inbox-alerts-menu" title="Avisos de mensajes">
          <BellIcon className="size-4" /> Avisos
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Cuando llega un mensaje</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            const next = !sound;
            setSoundEnabled(next);
            setSound(next);
            if (next) {
              unlockSound();
              window.setTimeout(playChime, 50);
            }
          }}
          data-testid="inbox-sound-toggle"
        >
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          <span className="flex-1">Sonido en el panel</span>
          <span className="text-ink-faint text-xs">{sound ? "Activado" : "Apagado"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="space-y-1">
          <span className="block">Avisos con el panel cerrado</span>
          <span className="text-ink-faint block text-[11px] font-normal leading-snug">{PUSH_HINT[push]}</span>
        </DropdownMenuLabel>
        {push === "on" ? (
          <>
            <DropdownMenuItem onSelect={() => void testPush()}>
              <BellRing className="size-4" /> Enviar un aviso de prueba
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onSelect={() => void disablePush()}>
              <BellOff className="size-4" /> Desactivar en este equipo
            </DropdownMenuItem>
          </>
        ) : push === "off" ? (
          <DropdownMenuItem disabled={busy || demo} onSelect={() => void enablePush()} data-testid="inbox-push-enable">
            <Bell className="size-4" /> Activar en este equipo
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={demo} onSelect={() => void refreshNames()} data-testid="inbox-refresh-names">
          <RefreshCw className="size-4" />
          <span className="flex-1">Traer los nombres de mi WhatsApp</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
