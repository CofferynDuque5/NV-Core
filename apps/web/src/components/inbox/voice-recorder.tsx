import * as React from "react";
import { Mic, Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VOICE_MAX_SECONDS, durationLabel, voiceFileName, voiceMimeType } from "@/lib/chat-media";

type State = { kind: "idle" } | { kind: "recording"; since: number } | { kind: "ready"; blob: Blob; seconds: number; url: string };

/**
 * Record a voice note like on WhatsApp: tap the mic, talk, then send or
 * discard. The browser asks for the microphone the first time.
 */
export function VoiceRecorder({
  disabled,
  sending,
  onSend,
  onActiveChange,
}: {
  disabled?: boolean;
  sending?: boolean;
  onSend: (file: Blob, fileName: string) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const [now, setNow] = React.useState(Date.now());
  const recorder = React.useRef<MediaRecorder | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const mime = React.useRef("audio/webm");

  React.useEffect(() => onActiveChange?.(state.kind !== "idle"), [state.kind, onActiveChange]);

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop());

  React.useEffect(() => {
    if (state.kind !== "recording") return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() - state.since > VOICE_MAX_SECONDS * 1000) recorder.current?.stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  // Never leave the microphone on when the chat closes.
  React.useEffect(() => () => stopTracks(), []);

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Este navegador no puede grabar audio. Prueba con Chrome, Edge, Firefox o Safari actualizados.");
      return;
    }
    const type = voiceMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!type) {
      toast.error("Este navegador no graba en un formato que WhatsApp acepte.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("No hay permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.");
      return;
    }
    mime.current = type;
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    const since = Date.now();
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: mime.current.split(";")[0] });
      const seconds = Math.round((Date.now() - since) / 1000);
      if (blob.size === 0 || seconds < 1) {
        setState({ kind: "idle" });
        return;
      }
      setState({ kind: "ready", blob, seconds, url: URL.createObjectURL(blob) });
    };
    recorder.current = rec;
    rec.start(500);
    setNow(since);
    setState({ kind: "recording", since });
  }

  function discard() {
    if (state.kind === "recording") {
      recorder.current!.onstop = null;
      recorder.current?.stop();
      stopTracks();
    }
    if (state.kind === "ready") URL.revokeObjectURL(state.url);
    setState({ kind: "idle" });
  }

  if (state.kind === "idle") {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={() => void start()}
        aria-label="Grabar nota de voz"
        title="Grabar nota de voz"
        data-testid="inbox-voice-start"
      >
        <Mic className="size-4" />
      </Button>
    );
  }

  return (
    <div className="border-line-soft bg-panel flex flex-1 items-center gap-2 rounded-lg border px-2 py-1" data-testid="inbox-voice-bar">
      <Button type="button" size="icon" variant="ghost" onClick={discard} aria-label="Descartar nota de voz" title="Descartar">
        <Trash2 className="size-4" />
      </Button>
      {state.kind === "recording" ? (
        <>
          <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="text-ink text-sm tabular-nums" aria-live="polite">
            Grabando {durationLabel((now - state.since) / 1000)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => recorder.current?.stop()}
            data-testid="inbox-voice-stop"
          >
            <Square className="size-3.5" /> Detener
          </Button>
        </>
      ) : (
        <>
          <audio src={state.url} controls className="h-8 min-w-0 flex-1" />
          <Button
            type="button"
            size="icon"
            disabled={sending}
            onClick={() => {
              onSend(state.blob, voiceFileName(mime.current));
              URL.revokeObjectURL(state.url);
              setState({ kind: "idle" });
            }}
            aria-label="Enviar nota de voz"
            data-testid="inbox-voice-send"
          >
            <Send className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}
