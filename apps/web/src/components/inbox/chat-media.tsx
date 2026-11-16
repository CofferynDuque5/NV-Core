import * as React from "react";
import type { ChatMedia, Message } from "@nv/domain";
import { Download, FileText, Gauge, ImageOff, Mic, Music, Video } from "lucide-react";

import { cn } from "@/lib/utils";
import { fileSizeLabel, durationLabel } from "@/lib/chat-media";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** The caption after the «📷 Foto» label the server keeps as text. */
export function captionOf(m: Message): string {
  if (!m.media) return m.text;
  return m.text.replace(/^(📷 Foto|🎥 Video|🎞️ GIF|🎤 Nota de voz|🎵 Audio|Sticker|📄 [^\n]*?)(\s|$)/u, "").trim();
}

/** Photo, video, audio, voice note, sticker or document inside a chat bubble. */
export function ChatMediaView({ media, out, onOpenImage }: { media: ChatMedia; out: boolean; onOpenImage?: (url: string) => void }) {
  const [failed, setFailed] = React.useState(false);
  const muted = out ? "text-white/75" : "text-ink-faint";
  if (media.unavailable || !media.url) {
    return (
      <div className={cn("flex items-center gap-2 py-1 text-xs", muted)} data-testid="chat-media-unavailable">
        <ImageOff className="size-4 shrink-0" />
        <span>{media.unavailable ?? "Archivo no disponible."}</span>
      </div>
    );
  }
  if (failed) {
    return (
      <button
        type="button"
        onClick={() => setFailed(false)}
        className={cn("flex items-center gap-2 py-1 text-xs underline", muted)}
      >
        <ImageOff className="size-4" /> No se pudo cargar. Toca para reintentar.
      </button>
    );
  }
  switch (media.kind) {
    case "image":
    case "sticker":
      return (
        <button
          type="button"
          className="block overflow-hidden rounded-lg"
          onClick={() => onOpenImage?.(media.url!)}
          aria-label="Ver foto completa"
        >
          <img
            src={media.url}
            alt={media.kind === "sticker" ? "Sticker" : "Foto del chat"}
            loading="lazy"
            onError={() => setFailed(true)}
            className={cn(
              "bg-panel-raised object-cover",
              media.kind === "sticker" ? "size-32 bg-transparent object-contain" : "max-h-72 w-full max-w-xs",
            )}
            data-testid="chat-media-image"
          />
        </button>
      );
    case "video":
      return (
        <video
          src={media.url}
          controls
          preload="metadata"
          playsInline
          onError={() => setFailed(true)}
          className="max-h-72 w-full max-w-xs rounded-lg bg-black"
          data-testid="chat-media-video"
        />
      );
    case "voice":
    case "audio":
      return <AudioPlayer media={media} out={out} onError={() => setFailed(true)} />;
    default:
      return (
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5",
            out ? "bg-white/15 hover:bg-white/25" : "bg-panel-raised hover:bg-panel-high",
          )}
          data-testid="chat-media-document"
        >
          <FileText className="size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{media.name ?? "Documento"}</span>
            <span className={cn("block text-[11px]", muted)}>{fileSizeLabel(media.size)}</span>
          </span>
          <Download className="size-4 shrink-0" />
        </a>
      );
  }
}

const SPEEDS = [1, 1.5, 2];

/** Audio / voice note: the browser's player plus WhatsApp's 1× / 1.5× / 2× speed. */
function AudioPlayer({ media, out, onError }: { media: ChatMedia; out: boolean; onError: () => void }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = React.useState(1);
  const Icon = media.kind === "voice" ? Mic : Music;
  return (
    <div className="flex min-w-[220px] max-w-xs flex-col gap-1" data-testid="chat-media-audio">
      <div className={cn("flex items-center gap-1.5 text-[11px]", out ? "text-white/80" : "text-ink-faint")}>
        <Icon className="size-3.5" />
        {media.kind === "voice" ? "Nota de voz" : "Audio"}
        {media.seconds ? <span className="tabular-nums">· {durationLabel(media.seconds)}</span> : null}
        <button
          type="button"
          className={cn("ml-auto inline-flex items-center gap-0.5 rounded px-1 font-semibold tabular-nums", out ? "bg-white/15" : "bg-panel-raised")}
          title="Velocidad"
          aria-label={`Velocidad ${speed}×`}
          onClick={() => {
            const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
            setSpeed(next);
            if (ref.current) ref.current.playbackRate = next;
          }}
        >
          <Gauge className="size-3" /> {speed}×
        </button>
      </div>
      <audio
        ref={ref}
        src={media.url}
        controls
        preload="none"
        onError={onError}
        onPlay={(e) => (e.currentTarget.playbackRate = speed)}
        className="h-9 w-full"
      />
    </div>
  );
}

/** Full-size photo over the page. */
export function ImageViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(url)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-2">
        <DialogHeader className="sr-only">
          <DialogTitle>Foto</DialogTitle>
          <DialogDescription>Foto del chat a tamaño completo.</DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="flex flex-col items-center gap-2">
            <img src={url} alt="Foto del chat" className="max-h-[80vh] w-auto rounded-md object-contain" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex items-center gap-1 text-xs">
              <Download className="size-3.5" /> Abrir o descargar
            </a>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Every photo, video, audio and document of the chat, in one place. */
export function ChatMediaGallery({
  open,
  onOpenChange,
  messages,
  onOpenImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  onOpenImage: (url: string) => void;
}) {
  const withMedia = messages.filter((m) => m.media);
  const images = withMedia.filter((m) => m.media!.kind === "image" || m.media!.kind === "sticker" || m.media!.kind === "video");
  const audios = withMedia.filter((m) => m.media!.kind === "voice" || m.media!.kind === "audio");
  const docs = withMedia.filter((m) => m.media!.kind === "document");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fotos, audios y archivos</DialogTitle>
          <DialogDescription>
            {withMedia.length ? `${withMedia.length} en este chat (los más recientes).` : "Este chat todavía no tiene fotos, audios ni archivos."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto" data-testid="chat-media-gallery">
          {images.length ? (
            <section>
              <h3 className="text-ink-muted mb-2 text-xs font-semibold uppercase tracking-wide">Fotos y videos</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {images.map((m) =>
                  m.media!.url && m.media!.kind !== "video" ? (
                    <button key={m.id} type="button" onClick={() => onOpenImage(m.media!.url!)} className="aspect-square overflow-hidden rounded-md">
                      <img src={m.media!.url} alt="Foto del chat" loading="lazy" className="bg-panel-raised size-full object-cover" />
                    </button>
                  ) : (
                    <a
                      key={m.id}
                      href={m.media!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-panel-raised text-ink-faint flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-[11px]"
                    >
                      <Video className="size-5" /> {m.media!.unavailable ? "No disponible" : "Video"}
                    </a>
                  ),
                )}
              </div>
            </section>
          ) : null}
          {audios.length ? (
            <section className="space-y-2">
              <h3 className="text-ink-muted text-xs font-semibold uppercase tracking-wide">Audios</h3>
              {audios.map((m) => (
                <ChatMediaView key={m.id} media={m.media!} out={false} />
              ))}
            </section>
          ) : null}
          {docs.length ? (
            <section className="space-y-2">
              <h3 className="text-ink-muted text-xs font-semibold uppercase tracking-wide">Documentos</h3>
              {docs.map((m) => (
                <ChatMediaView key={m.id} media={m.media!} out={false} />
              ))}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
