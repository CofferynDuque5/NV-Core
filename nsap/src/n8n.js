import { nanoid } from "nanoid";

import { store } from "./store.js";

/**
 * Integración con n8n vía REST/Webhooks. n8n NO es el backend: sólo ejecuta
 * workflows. El backend le envía trabajos (dispatch) y recibe el resultado por
 * un webhook de callback.
 */
const BASE_URL = process.env.N8N_BASE_URL; // p.ej. https://n8n.midominio.com
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; // webhook del workflow (opcional; si no, se arma con BASE_URL)
const API_KEY = process.env.N8N_API_KEY;
export const CALLBACK_TOKEN = process.env.N8N_CALLBACK_TOKEN || "";
const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");

export function n8nConfigured() {
  return Boolean(WEBHOOK_URL || BASE_URL);
}

function webhookFor(workflow) {
  if (WEBHOOK_URL) return WEBHOOK_URL;
  if (BASE_URL && workflow) return `${BASE_URL.replace(/\/$/, "")}/webhook/${encodeURIComponent(workflow)}`;
  return null;
}

/** Envía un trabajo a n8n. Crea un job 'pending' y postea al webhook. */
export async function dispatch({ workflow, payload }, io) {
  const url = webhookFor(workflow);
  if (!url) {
    throw Object.assign(new Error("n8n no configurado. Define N8N_WEBHOOK_URL o N8N_BASE_URL."), { status: 503 });
  }
  const job = store.addJob({
    id: nanoid(),
    workflow: workflow ?? null,
    payload: payload ?? {},
    status: "pending",
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const callbackUrl = `${APP_URL}/api/n8n/callback${CALLBACK_TOKEN ? `?token=${encodeURIComponent(CALLBACK_TOKEN)}` : ""}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { "X-N8N-API-KEY": API_KEY } : {}),
      },
      body: JSON.stringify({ jobId: job.id, callbackUrl, ...payload }),
    });
    if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
    // Si el workflow responde en la misma llamada, lo guardamos como resultado.
    const text = await res.text();
    if (text) {
      try {
        store.updateJob(job.id, { status: "done", result: JSON.parse(text) });
      } catch {
        store.updateJob(job.id, { status: "done", result: text });
      }
    }
  } catch (err) {
    store.updateJob(job.id, { status: "error", error: err.message });
  }
  io?.emit("n8n:changed");
  return store.getJob(job.id);
}

/** Procesa el callback asíncrono de n8n. */
export function handleCallback({ jobId, result, error }, io) {
  const job = store.getJob(jobId);
  if (!job) return null;
  const updated = store.updateJob(jobId, {
    status: error ? "error" : "done",
    result: result ?? null,
    error: error ?? null,
  });
  io?.emit("n8n:changed");
  return updated;
}
