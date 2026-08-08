
import * as React from "react";
import { useParams } from "react-router-dom";
import type { PublicForm } from "@nv/domain";

import { API_URL, isBackendConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "loading" | "ready" | "submitting" | "done" | "error";

/**
 * Public, embeddable lead-capture form. No auth, no app shell — it talks to the
 * backend's /public/forms endpoints directly so it works standalone or inside an
 * iframe on any site.
 */
export default function PublicFormPage() {
  const { form: formId } = useParams<{ form: string }>();
  const [form, setForm] = React.useState<PublicForm | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [hp, setHp] = React.useState(""); // honeypot
  const [status, setStatus] = React.useState<Status>("loading");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!formId) return;
    if (!isBackendConfigured()) {
      setStatus("error");
      setMessage("Formulario no disponible en modo demo.");
      return;
    }
    fetch(`${API_URL}/api/public/forms/${formId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((f: PublicForm) => {
        setForm(f);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Este formulario no existe o fue eliminado.");
      });
  }, [formId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch(`${API_URL}/api/public/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, hp }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        successMessage?: string;
        redirectUrl?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus("ready");
        setMessage(data.message ?? "No se pudo enviar. Revisa los campos.");
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setMessage(data.successMessage ?? "¡Gracias!");
      setStatus("done");
    } catch {
      setStatus("ready");
      setMessage("Error de red. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-panel-sunken p-4">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-panel-high p-6 shadow-panel">
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
        ) : form ? (
          <form onSubmit={submit} className="space-y-4">
            <h1 className="font-display text-lg font-semibold text-ink-bright">{form.name}</h1>

            {form.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`pf-${f.key}`}>
                  {f.label}
                  {f.required ? <span className="text-state-danger"> *</span> : null}
                </Label>
                <Input
                  id={`pf-${f.key}`}
                  type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "text"}
                  required={f.required}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}

            {/* Honeypot: hidden from humans; bots that fill it are dropped server-side. */}
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
        ) : null}
      </div>
    </div>
  );
}
