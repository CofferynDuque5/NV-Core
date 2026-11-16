import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, Monitor, Smartphone } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import {
  INSTALL_GUIDES,
  INSTALL_PLATFORMS,
  detectPlatform,
  iosOutsideSafari,
  parsePlatform,
  type InstallPlatform,
} from "@/lib/install";
import { cn } from "@/lib/utils";

/**
 * /instalar — how to install NV Marketing as an app on this device. The
 * website's «Descargar la app» buttons land here (with ?so=android|ios|…).
 * Public: no account needed to install.
 */
export default function InstalarPage() {
  const [params] = useSearchParams();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const here = React.useMemo(() => detectPlatform(ua, navigator.maxTouchPoints ?? 0), [ua]);
  const [platform, setPlatform] = React.useState<InstallPlatform>(() => parsePlatform(params.get("so")) ?? here);
  const { canPrompt, installed, install } = useInstallPrompt();
  const [result, setResult] = React.useState<"ok" | "no" | null>(null);
  const guide = INSTALL_GUIDES[platform];
  const sameDevice = platform === here;

  async function onInstall() {
    setResult((await install()) ? "ok" : "no");
  }

  return (
    <AuthShell
      title="Instala NV Marketing"
      subtitle="Tenlo como app en tu teléfono y en tu computadora: con su icono, su propia ventana y siempre actualizado."
      footer={
        <span>
          ¿Prefieres seguir en el navegador?{" "}
          <Link to="/" className="font-medium text-brand hover:underline">
            Abrir el panel
          </Link>
        </span>
      }
    >
      <div className="space-y-5" data-testid="install-page">
        {installed || result === "ok" ? (
          <p className="flex items-center gap-2 rounded-lg border border-state-success/30 bg-state-success/10 px-3 py-2 text-sm text-state-success">
            <CheckCircle2 className="size-4 shrink-0" /> NV Marketing ya está instalado en este dispositivo.
          </p>
        ) : canPrompt && sameDevice ? (
          <Button size="lg" className="w-full" onClick={onInstall} data-testid="install-now">
            <Download /> Instalar ahora
          </Button>
        ) : null}
        {result === "no" ? (
          <p className="text-xs text-ink-muted">No se instaló. Puedes intentarlo otra vez o seguir los pasos de abajo.</p>
        ) : null}

        <div role="tablist" aria-label="Dispositivo" className="flex flex-wrap gap-1.5">
          {INSTALL_PLATFORMS.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={p === platform}
              onClick={() => setPlatform(p)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                p === platform
                  ? "border-brand bg-brand text-white"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {p === "android" || p === "ios" ? <Smartphone className="size-3.5" /> : <Monitor className="size-3.5" />}
              {INSTALL_GUIDES[p].label}
              {p === here ? <span className="opacity-70">· este</span> : null}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-panel-raised p-4">
          <p className="mb-3 text-sm font-semibold">
            {guide.label} · con {guide.browser}
          </p>
          <ol className="space-y-2.5 text-sm text-ink-muted">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          {platform === "ios" && iosOutsideSafari(ua) ? (
            <p className="mt-3 rounded-lg bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
              Estás en otro navegador: copia la dirección y ábrela en Safari para poder añadirla.
            </p>
          ) : null}
        </div>

        <p className="text-xs text-ink-muted">
          No ocupa casi espacio ni necesita tienda de aplicaciones. Se actualiza sola cada vez que publicamos mejoras.
        </p>
      </div>
    </AuthShell>
  );
}
