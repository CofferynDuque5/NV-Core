
import * as React from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import type { CampaignAttachment, SocialResult } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useSocialStatus } from "@/hooks/use-domain-data";
import { useSocialPublish, useUploadCampaignAttachment } from "@/hooks/use-domain-mutations";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const IG_FORMATS = [
  { id: "feed", label: "Feed" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Historia" },
  { id: "carousel", label: "Carrusel" },
];

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

const pill = (active: boolean) =>
  cn(
    "rounded-full border px-2.5 py-1 text-xs transition-colors",
    active
      ? "border-brand/60 bg-brand/10 text-ink"
      : "border-line-soft text-ink-muted hover:border-line-bright",
  );

/**
 * Direct "publish now" composer for Facebook / Instagram. Uploads media to
 * Cloudinary and publishes via the Meta Graph API. Reused as a card (Conexiones)
 * and inside a dialog (Biblioteca).
 */
export function SocialPublishForm({
  initialAttachments = [],
}: {
  initialAttachments?: CampaignAttachment[];
}) {
  const status = useSocialStatus();
  const publish = useSocialPublish();
  const upload = useUploadCampaignAttachment();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [message, setMessage] = React.useState("");
  const [fb, setFb] = React.useState(false);
  const [ig, setIg] = React.useState(false);
  const [format, setFormat] = React.useState("feed");
  const [attachments, setAttachments] = React.useState<CampaignAttachment[]>(initialAttachments);
  const [results, setResults] = React.useState<SocialResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fbReady = status.data?.facebook ?? false;
  const igReady = status.data?.instagram ?? false;

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      try {
        const att = await upload.mutateAsync(file);
        setAttachments((prev) => [...prev, att]);
      } catch {
        /* toast handled in hook */
      }
    }
  }

  async function onPublish() {
    setError(null);
    setResults(null);
    const targets: ("facebook" | "instagram")[] = [];
    if (fb) targets.push("facebook");
    if (ig) targets.push("instagram");
    if (!targets.length) {
      setError("Elige Facebook y/o Instagram.");
      return;
    }
    if (!message.trim() && attachments.length === 0) {
      setError("Escribe un mensaje o adjunta una imagen/video.");
      return;
    }
    try {
      const res = await publish.mutateAsync({
        targets,
        message: message.trim() || undefined,
        attachments,
        format: ig ? format : undefined,
      });
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="sp-message">Mensaje</Label>
        <Textarea
          id="sp-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Texto de la publicación…"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Adjuntos</Label>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={onPickFiles}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-muted transition-colors hover:border-line-bright disabled:opacity-60"
        >
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {upload.isPending ? "Subiendo…" : "Subir imagen o video (Cloudinary)"}
        </button>
        {attachments.length > 0 ? (
          <div className="space-y-0.5">
            {attachments.map((att, i) => (
              <div
                key={`${att.url}-${i}`}
                className="flex items-center gap-2 rounded-md bg-panel-raised px-2 py-1.5 text-xs"
              >
                <span className="shrink-0 rounded bg-panel-high px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                  {att.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{att.filename ?? att.url}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-ink-faint hover:text-state-danger"
                  title="Quitar"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Destinos</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFb((v) => !v)}
            disabled={!fbReady}
            className={cn(pill(fb), !fbReady && "cursor-not-allowed opacity-50")}
            title={fbReady ? undefined : "Facebook no configurado"}
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() => setIg((v) => !v)}
            disabled={!igReady}
            className={cn(pill(ig), !igReady && "cursor-not-allowed opacity-50")}
            title={igReady ? undefined : "Instagram no configurado"}
          >
            Instagram
          </button>
        </div>
        {!fbReady && !igReady ? (
          <p className="text-[11px] text-ink-faint">
            Configura Facebook/Instagram en el backend (o en las conexiones) para publicar.
          </p>
        ) : null}
      </div>

      {ig ? (
        <div className="space-y-1.5">
          <Label htmlFor="sp-format">Formato de Instagram</Label>
          <select
            id="sp-format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className={selectClass}
          >
            {IG_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? <p className="text-xs text-state-danger">{error}</p> : null}
      {results ? (
        <div className="space-y-0.5 text-xs">
          {results.map((r) => (
            <div key={r.target} className={r.ok ? "text-state-success" : "text-state-danger"}>
              {r.target}: {r.ok ? "publicado" : (r.error ?? "error")}
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPublish}
        disabled={publish.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-60"
      >
        {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Publicar ahora
      </button>
    </div>
  );
}

/** Dialog wrapper around the composer, prefilled with an attachment (Biblioteca). */
export function SocialPublishDialog({
  open,
  onOpenChange,
  initialAttachments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialAttachments?: CampaignAttachment[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicar en redes</DialogTitle>
          <DialogDescription>Publica ahora en Facebook y/o Instagram.</DialogDescription>
        </DialogHeader>
        {/* Remount per open so the prefilled attachment resets cleanly. */}
        {open ? <SocialPublishForm initialAttachments={initialAttachments} /> : null}
      </DialogContent>
    </Dialog>
  );
}
