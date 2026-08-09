import { Loader2, Sparkles } from "lucide-react";

import { useGenerateVariants, useImproveMessage } from "@/hooks/use-domain-mutations";

/**
 * Small reusable "AI" button for text fields. If the field already has text it
 * *improves* it; if it's empty it *generates* one from `topic`. Shared by the
 * forms, sequences, funnels and automations editors so the behaviour is
 * consistent. Falls back to an error callback (no toast) so the host dialog can
 * show it inline.
 */
export function AiTextButton({
  text,
  topic,
  onResult,
  onError,
  label = "Mejorar con IA",
  className,
}: {
  text: string;
  topic?: string;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
}) {
  const improve = useImproveMessage();
  const generate = useGenerateVariants();
  const pending = improve.isPending || generate.isPending;

  async function run() {
    try {
      const base = text.trim();
      if (base) {
        const res = await improve.mutateAsync(base);
        if (res?.text) onResult(res.text);
        return;
      }
      const prompt = (topic ?? "").trim();
      if (!prompt) {
        onError?.("Escribe un texto o un tema para usar la IA.");
        return;
      }
      const variants = await generate.mutateAsync({ prompt, channel: "wa", tone: "cercano" });
      if (variants[0]?.text) onResult(variants[0].text);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "No se pudo usar la IA.");
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Generar o mejorar el texto con IA"
      className={
        className ??
        "inline-flex h-7 items-center gap-1 rounded-md border border-line-soft px-2 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink disabled:opacity-60"
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {label}
    </button>
  );
}
