import { Download, Laptop, Loader2 } from "lucide-react";

import { relativeTime } from "@/lib/utils";
import { usePcAgentStatus } from "@/hooks/use-domain-data";
import { Panel, PanelHeader } from "@/components/common/panel";
import { StatusDot } from "@/components/common/status-dot";
import { ChannelChip } from "@/components/common/channel-badge";

/**
 * Facebook / Instagram via "NV Agente PC": shows whether the companion running
 * on the operator's computer is online and logged in, how many posts wait for
 * it, and where to download/install it.
 */
export function PcAgentCard() {
  const q = usePcAgentStatus();
  const s = q.data;

  return (
    <Panel>
      <PanelHeader
        title="Facebook e Instagram desde tu PC"
        description="Publica con tu propio inicio de sesión, sin app de Meta ni servicios externos."
        action={
          <a
            href="/agente/NV-Agente-PC.zip"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand/60"
          >
            <Download className="size-3.5" /> Descargar NV Agente PC
          </a>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {q.isLoading ? (
              <Loader2 className="size-4 animate-spin text-ink-faint" />
            ) : (
              <StatusDot status={s?.online ? "ok" : "down"} />
            )}
            <span className="font-semibold text-ink-bright">
              {s?.online ? `Agente en línea${s.hostname ? ` · ${s.hostname}` : ""}` : "Agente apagado"}
            </span>
            {s?.lastSeenAt ? (
              <span className="text-xs text-ink-faint">· visto {relativeTime(s.lastSeenAt)}</span>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Facebook</dt>
              <dd className="flex items-center gap-1.5 text-ink">
                <ChannelChip id="fb" /> {s?.facebook ? "Sesión iniciada" : "Sin sesión"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Instagram</dt>
              <dd className="flex items-center gap-1.5 text-ink">
                <ChannelChip id="ig" /> {s?.instagram ? "Sesión iniciada" : "Sin sesión"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">En cola</dt>
              <dd className="text-ink">{s?.pending ?? 0} publicación{(s?.pending ?? 0) === 1 ? "" : "es"}</dd>
            </div>
          </dl>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-muted">
            <li>Descarga el zip, descomprímelo en tu PC y abre <code className="text-ink">INSTALAR.bat</code> (instala Node si hace falta y Chromium).</li>
            <li>Abre <code className="text-ink">INICIAR SESION.bat</code>: se abre un navegador; entra en Facebook e Instagram con tu cuenta y vuelve a la ventana negra y pulsa Enter.</li>
            <li>Deja abierto <code className="text-ink">INICIAR.bat</code>: cada minuto revisa el calendario y publica lo que toque. Lo que publiques desde «Publicar ahora» o las campañas de Facebook/Instagram también salen por aquí.</li>
          </ol>
        </div>
        <div className="grid w-full place-items-center rounded-xl border border-line-soft bg-panel-raised p-4 md:w-56">
          <div className="flex flex-col items-center gap-2 text-center text-ink-muted">
            <Laptop className={s?.online ? "size-10 text-state-success" : "size-10 text-ink-faint"} />
            <span className="text-xs">{s?.online ? "Publicando desde tu computadora" : "Abre el agente en tu PC"}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
