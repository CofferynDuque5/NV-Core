import * as React from "react";
import { Check, ImageIcon, MessageCircle } from "lucide-react";
import type { CampaignAttachment } from "@nv/domain";

import { cn } from "@/lib/utils";
import {
  buildPreviewContent,
  previewSurfaces,
  type PreviewSurface,
} from "@/lib/content-preview";

/**
 * Unified content editor preview: shows how the message + first image/video
 * will look on each enabled surface (WhatsApp chat, Telegram, WhatsApp Status,
 * Facebook, Instagram) before scheduling or publishing. Pure presentation —
 * the decisions come from `@/lib/content-preview`.
 */
export function ContentPreview({
  message,
  attachments,
  groupName,
  hasWaGroup,
  hasTgGroup,
  waStatus,
  fb,
  ig,
  igFormat,
  surfaces: surfacesProp,
}: {
  message: string;
  attachments?: CampaignAttachment[];
  groupName?: string;
  hasWaGroup?: boolean;
  hasTgGroup?: boolean;
  waStatus?: boolean;
  fb?: boolean;
  ig?: boolean;
  igFormat?: string;
  /** Explicit surface list (e.g. the calendar composer's single channel). */
  surfaces?: PreviewSurface[];
}) {
  const surfaces =
    surfacesProp ?? previewSurfaces({ hasWaGroup, hasTgGroup, waStatus, fb, ig, igFormat });
  const [active, setActive] = React.useState<string>(surfaces[0]?.id ?? "wa");

  // Keep the active tab valid as surfaces are toggled on/off.
  React.useEffect(() => {
    if (!surfaces.some((s) => s.id === active)) setActive(surfaces[0]?.id ?? "wa");
  }, [surfaces, active]);

  const surface = surfaces.find((s) => s.id === active) ?? surfaces[0]!;
  const content = buildPreviewContent({ message, attachments, groupName });

  return (
    <div className="space-y-2">
      {surfaces.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {surfaces.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                active === s.id
                  ? "border-brand/60 bg-brand/10 text-ink"
                  : "border-line-soft text-ink-muted hover:border-line-bright",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-line-soft bg-panel p-3">
        <SurfacePreview surface={surface} content={content} groupName={groupName} />
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-faint italic">{children}</span>;
}

/** The visual (image or video) shared by several mockups. */
function Media({
  visual,
  className,
  rounded = "rounded-lg",
}: {
  visual: CampaignAttachment | null;
  className?: string;
  rounded?: string;
}) {
  if (!visual?.url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-panel-high text-ink-faint",
          rounded,
          className,
        )}
      >
        <ImageIcon className="size-6" />
      </div>
    );
  }
  if (visual.kind === "video") {
    return (
      <video
        src={visual.url}
        className={cn("w-full object-cover", rounded, className)}
        muted
        controls
        playsInline
      />
    );
  }
  return (
    <img
      src={visual.url}
      alt="Vista previa"
      className={cn("w-full object-cover", rounded, className)}
    />
  );
}

function SurfacePreview({
  surface,
  content,
  groupName,
}: {
  surface: PreviewSurface;
  content: ReturnType<typeof buildPreviewContent>;
  groupName?: string;
}) {
  const { text, visual, attachmentsCount } = content;
  const now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  // ── WhatsApp / Telegram chat bubble ───────────────────────────────────────
  if (surface.id === "wa" || surface.id === "tg") {
    const isTg = surface.id === "tg";
    const wallpaper = isTg ? "bg-sky-950/40" : "bg-emerald-950/30";
    const bubble = isTg ? "bg-sky-500/20 border-sky-400/30" : "bg-emerald-500/20 border-emerald-400/30";
    return (
      <div className={cn("rounded-lg p-3", wallpaper)}>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <MessageCircle className="size-3.5" />
          {groupName?.trim() || (isTg ? "Grupo de Telegram" : "Grupo de WhatsApp")}
        </div>
        <div className="flex justify-end">
          <div className={cn("max-w-[85%] space-y-1.5 rounded-2xl rounded-tr-sm border p-1.5", bubble)}>
            {visual ? <Media visual={visual} className="max-h-52" /> : null}
            <p className="whitespace-pre-wrap px-1.5 text-sm text-ink">
              {text || <EmptyText>Escribe el mensaje…</EmptyText>}
            </p>
            <div className="flex items-center justify-end gap-0.5 px-1.5 text-[10px] text-ink-faint">
              {now}
              <Check className="size-3 text-sky-400" />
              <Check className="-ml-1.5 size-3 text-sky-400" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── WhatsApp Status (Estados) ──────────────────────────────────────────────
  if (surface.id === "wa_status") {
    return (
      <div className="mx-auto w-full max-w-[220px]">
        <div className="mb-1.5 h-0.5 rounded-full bg-emerald-400/60" />
        {visual ? (
          <div className="relative overflow-hidden rounded-lg">
            <Media visual={visual} rounded="rounded-lg" className="aspect-[9/16]" />
            {text ? (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <p className="whitespace-pre-wrap text-sm font-medium text-white">{text}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="flex aspect-[9/16] items-center justify-center rounded-lg p-4 text-center"
            style={{ backgroundColor: "#0B3D2E" }}
          >
            <p className="whitespace-pre-wrap text-base font-semibold text-white">
              {text || <span className="italic text-white/50">Tu Estado…</span>}
            </p>
          </div>
        )}
        <p className="mt-1.5 text-center text-[10px] text-ink-faint">
          Se publica en tu Estado de WhatsApp
        </p>
      </div>
    );
  }

  // ── Generic channel (TikTok / X / Threads / Email …) ───────────────────────
  if (surface.id === "generic") {
    return (
      <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-lg border border-line-soft bg-panel-raised">
        <div className="flex items-center gap-2 border-b border-line-soft p-2.5">
          <div className="size-7 rounded-full bg-panel-high" />
          <p className="truncate text-xs font-semibold text-ink">{surface.label}</p>
        </div>
        {visual ? <Media visual={visual} rounded="rounded-none" className="aspect-video" /> : null}
        <p className="whitespace-pre-wrap p-2.5 text-sm text-ink">
          {text || <EmptyText>Escribe el contenido…</EmptyText>}
        </p>
      </div>
    );
  }

  // ── Facebook / Instagram post ──────────────────────────────────────────────
  const isIg = surface.id === "ig";
  const vertical = isIg && (surface.format === "story" || surface.format === "reel");
  return (
    <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-lg border border-line-soft bg-panel-raised">
      <div className="flex items-center gap-2 p-2.5">
        <div
          className={cn(
            "size-7 rounded-full",
            isIg
              ? "bg-gradient-to-tr from-pink-500 to-amber-400"
              : "bg-blue-500",
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">
            {isIg ? "tu_cuenta" : "Tu página"}
          </p>
          <p className="text-[10px] text-ink-faint">{isIg ? (surface.format ?? "feed") : "Publicidad"}</p>
        </div>
      </div>
      {!isIg && text ? (
        <p className="whitespace-pre-wrap px-2.5 pb-2 text-xs text-ink">{text}</p>
      ) : null}
      <Media visual={visual} rounded="rounded-none" className={vertical ? "aspect-[9/16]" : "aspect-square"} />
      {isIg ? (
        <p className="whitespace-pre-wrap p-2.5 text-xs text-ink">
          <span className="font-semibold">tu_cuenta</span>{" "}
          {text || <EmptyText>Escribe el pie de foto…</EmptyText>}
        </p>
      ) : null}
      {attachmentsCount > 1 && isIg && surface.format === "carousel" ? (
        <p className="px-2.5 pb-2 text-[10px] text-ink-faint">Carrusel · {attachmentsCount} elementos</p>
      ) : null}
    </div>
  );
}
