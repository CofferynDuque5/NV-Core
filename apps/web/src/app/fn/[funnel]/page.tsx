
import * as React from "react";
import { useParams } from "react-router-dom";
import type { PublicForm, PublicFunnelStep } from "@nv/domain";

import { API_URL, isBackendConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "loading" | "ready" | "submitting" | "done" | "error";

/**
 * Public multi-step funnel runner. Fetches the current step from the backend,
 * renders it (opt-in steps embed the linked form; content steps show a
 * headline/body/CTA), and advances to the next step. No auth, no app shell.
 */
export default function PublicFunnelPage() {
  const { funnel: funnelId } = useParams<{ funnel: string }>();
  const [index, setIndex] = React.useState(0);
  const [step, setStep] = React.useState<PublicFunnelStep | null>(null);
  const [form, setForm] = React.useState<PublicForm | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [hp, setHp] = React.useState("");
  const [status, setStatus] = React.useState<Status>("loading");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!funnelId) return;
    if (!isBackendConfigured()) {
      setStatus("error");
      setMessage("Embudo no disponible en modo demo.");
      return;
    }
    let alive = true;
    setStatus("loading");
    setForm(null);
    setValues({});
    (async () => {
      try {
        const s: PublicFunnelStep = await fetch(
          `${API_URL}/api/public/funnels/${funnelId}/steps/${index}`,
        ).then((r) => (r.ok ? r.json() : Promise.reject(new Error("step"))));
        if (!alive) return;
        setStep(s);
        if (s.type === "optin" && s.formId) {
          const f: PublicForm = await fetch(`${API_URL}/api/public/forms/${s.formId}`).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("form")),
          );
          if (!alive) return;
          setForm(f);
        }
        setStatus("ready");
      } catch {
        if (alive) {
          setStatus("error");
          setMessage("Este embudo no existe o fue eliminado.");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [funnelId, index]);

  function advance() {
    if (step?.nextIndex != null) {
      setMessage("");
      setIndex(step.nextIndex);
    } else {
      setStatus("done");
      setMessage("¡Gracias!");
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!step?.formId) return;
    setStatus("submitting");
    try {
      const res = await fetch(`${API_URL}/api/public/forms/${step.formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, hp }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setStatus("ready");
        setMessage(data.message ?? "No se pudo enviar. Revisa los campos.");
        return;
      }
      advance();
      setStatus("ready");
    } catch {
      setStatus("ready");
      setMessage("Error de red. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-panel-sunken p-4">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-panel-high p-6 shadow-panel">
        {step ? (
          <div className="mb-3 flex items-center gap-1">
            {Array.from({ length: step.total }).map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step.index ? "bg-brand" : "bg-line-strong"}`}
              />
            ))}
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="grid h-40 place-items-center text-ink-muted">
            <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          </div>
        ) : status === "error" ? (
          <p className="text-center text-sm text-ink-muted">{message}</p>
        ) : status === "done" ? (
          <div className="space-y-2 text-center">
            <div className="text-2xl">✅</div>
            <p className="text-sm font-medium text-ink-bright">{message}</p>
          </div>
        ) : step?.type === "optin" && form ? (
          <form onSubmit={submitForm} className="space-y-4">
            <h1 className="font-display text-lg font-semibold text-ink-bright">{step.headline || form.name}</h1>
            {form.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`ff-${f.key}`}>
                  {f.label}
                  {f.required ? <span className="text-state-danger"> *</span> : null}
                </Label>
                <Input
                  id={`ff-${f.key}`}
                  type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "text"}
                  required={f.required}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              className="hidden"
            />
            {message ? <p className="text-xs text-state-danger">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={status === "submitting"}>
              {status === "submitting" ? "Enviando…" : form.submitLabel}
            </Button>
          </form>
        ) : step ? (
          <div className="space-y-4 text-center">
            <h1 className="font-display text-xl font-semibold text-ink-bright">
              {step.headline || step.name}
            </h1>
            {step.body ? <p className="text-sm text-ink-muted">{step.body}</p> : null}
            <Button className="w-full" onClick={advance}>
              {step.ctaLabel || (step.nextIndex != null ? "Continuar" : "Finalizar")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
