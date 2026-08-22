import * as React from "react";
import { ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { CampaignAttachment } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useGenerateFlyer, useUploadCampaignAttachment } from "@/hooks/use-domain-mutations";
import { Textarea } from "@/components/ui/textarea";

const FLYER_SIZES: { id: string; label: string }[] = [
  { id: "1024x1024", label: "Cuadrado" },
  { id: "1024x1536", label: "Vertical" },
  { id: "1536x1024", label: "Horizontal" },
];

/** Convert a data: URL (base64) into a File so it can be uploaded to Cloudinary. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(head ?? "")?.[1] ?? "image/png";
  const bin = atob(body ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/**
 * Inline "Flyer con IA" control for the content editors. Generates an image
 * from a prompt (OpenAI), uploads it to Cloudinary so it becomes a hosted,
 * deliverable attachment, and hands it back via `onGenerated` — where it shows
 * in the live preview and is sent with the campaign/post. Falls back to the raw
 * data URL (preview-only) when Cloudinary isn't configured.
 */
export function AiFlyerButton({
  defaultPrompt,
  onGenerated,
}: {
  defaultPrompt?: string;
  onGenerated: (attachment: CampaignAttachment) => void;
}) {
  const flyer = useGenerateFlyer();
  const upload = useUploadCampaignAttachment();
  const [openPanel, setOpenPanel] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [size, setSize] = React.useState(FLYER_SIZES[0]!.id);
  const [error, setError] = React.useState<string | null>(null);
  const busy = flyer.isPending || upload.isPending;

  function toggle() {
    setOpenPanel((v) => {
      const next = !v;
      if (next) {
        setPrompt((p) => p || (defaultPrompt?.trim() ?? ""));
        setError(null);
      }
      return next;
    });
  }

  async function generate() {
    const p = prompt.trim();
    if (p.length < 3) {
      setError("Describe el flyer (mínimo 3 caracteres).");
      return;
    }
    setError(null);
    try {
      const { url } = await flyer.mutateAsync({ prompt: p, size });
      if (url.startsWith("http")) {
        onGenerated({ url, kind: "image", mime: "image/png", filename: "flyer-ia.png" });
      } else {
        // data: URL — upload to Cloudinary so it's deliverable; fall back to the
        // raw data URL (preview works, delivery won't) if upload isn't available.
        try {
          const att = await upload.mutateAsync(dataUrlToFile(url, "flyer-ia.png"));
          onGenerated(att);
        } catch {
          onGenerated({ url, kind: "image", mime: "image/png", filename: "flyer-ia.png" });
          toast.warning(
            "Flyer generado, pero Cloudinary no está configurado: se usará solo en la vista previa (no se enviará como imagen).",
          );
        }
      }
      toast.success("Flyer agregado.");
      setOpenPanel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el flyer.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
      >
        <Sparkles className="size-3.5" /> Flyer con IA
      </button>

      {openPanel ? (
        <div className="space-y-2 rounded-lg border border-line-soft bg-panel-raised p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink">Generar flyer con IA</span>
            <button
              type="button"
              onClick={() => setOpenPanel(false)}
              className="rounded p-0.5 text-ink-faint hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <Textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ej: flyer promocional de streaming, colores neón, 50% de descuento, estilo moderno…"
          />
          <div className="flex flex-wrap gap-1.5">
            {FLYER_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSize(s.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  size === s.id
                    ? "border-brand/60 bg-brand/10 text-ink"
                    : "border-line-soft text-ink-muted hover:border-line-bright",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {error ? <p className="text-[11px] text-state-danger">{error}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              {upload.isPending ? "Subiendo…" : flyer.isPending ? "Generando…" : "Generar y agregar"}
            </button>
            <span className="text-[11px] text-ink-faint">Usa OpenAI · se agrega a los adjuntos</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
