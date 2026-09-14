import type { AppConfig } from "../../config/configuration";

export type AiProviderId = "openai" | "anthropic" | "gemini";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/** A minimal, SDK-free chat-completion contract implemented over `fetch`. */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string>;
}

/**
 * Pick which provider to use from validated config, without instantiating it.
 * Honours an explicit `AI_PROVIDER` when its key is present, otherwise falls
 * back to the first configured provider in a stable priority order. Returns
 * `null` when no provider is configured (→ graceful 503 upstream).
 */
export function selectProviderId(ai: AppConfig["integrations"]["ai"]): AiProviderId | null {
  const configured: Record<AiProviderId, boolean> = {
    openai: Boolean(ai.openai),
    anthropic: Boolean(ai.anthropic),
    gemini: Boolean(ai.gemini),
  };
  if (ai.provider && configured[ai.provider]) return ai.provider;
  // Gemini primero: es el proveedor del asistente (y tiene capa gratuita).
  const priority: AiProviderId[] = ["gemini", "openai", "anthropic"];
  return priority.find((id) => configured[id]) ?? null;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`;
}

class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts?.temperature ?? 0.8,
        max_tokens: opts?.maxTokens ?? 800,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI: ${await readError(res)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }
}

class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts?.maxTokens ?? 800,
        temperature: opts?.temperature ?? 0.8,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic: ${await readError(res)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
  }
}


// ── Gemini model discovery ────────────────────────────────────────────────────
// Google retires model names regularly ("gemini-2.5-flash is no longer
// available to new users"). Instead of hard-coding one, we ask the API which
// models THIS key can use and pick the best current one. Cached per key.

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const modelCache = new Map<string, { name: string; at: number }>();
const MODEL_TTL_MS = 6 * 3600_000;

/** Numeric version from a model name (gemini-2.5-flash → 2.5, gemini-3-pro → 3). */
function geminiVersion(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/** Rank candidates: newest version first, then flash over pro, stable over preview/lite. */
function rankGemini(names: string[], kind: "text" | "image"): string | null {
  const bad = /embedding|tts|live|audio|native|computer-use|robotics|learnlm|gemma|aqa|veo|imagen|nano|thinking|exp\b/i;
  const list = names
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => n.startsWith("gemini-") && !bad.test(n))
    .filter((n) => (kind === "image" ? /image/i.test(n) : !/image/i.test(n)));
  if (list.length === 0) return null;
  const score = (n: string) =>
    geminiVersion(n) * 1000 +
    (/flash/i.test(n) ? 100 : 0) +
    (/lite/i.test(n) ? -50 : 0) +
    (/preview|exp/i.test(n) ? -20 : 0) +
    (/latest/i.test(n) ? 5 : 0) -
    Math.min(n.length, 40) / 100;
  return list.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Resolve the Gemini model to call. An explicit configured name (anything but
 * "auto") is used as-is; "auto" discovers the best available model for the
 * key. The result is cached; call {@link invalidateGeminiModel} after a 404.
 */
export async function resolveGeminiModel(
  apiKey: string,
  configured: string | undefined,
  kind: "text" | "image",
): Promise<string> {
  if (configured && configured !== "auto" && !(kind === "image" && !/image/i.test(configured))) {
    return configured;
  }
  const key = `${kind}:${apiKey.slice(-8)}`;
  const hit = modelCache.get(key);
  if (hit && Date.now() - hit.at < MODEL_TTL_MS) return hit.name;
  let names: string[] = [];
  try {
    const res = await fetch(`${GEMINI_API}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
      };
      names = (data.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m) => String(m.name ?? ""));
    }
  } catch {
    /* fall through to the static fallback */
  }
  const picked =
    rankGemini(names, kind) ?? (kind === "image" ? "gemini-2.5-flash-image" : "gemini-2.5-flash");
  modelCache.set(key, { name: picked, at: Date.now() });
  return picked;
}

export function invalidateGeminiModel(apiKey: string, kind: "text" | "image"): void {
  modelCache.delete(`${kind}:${apiKey.slice(-8)}`);
}

/** Gemini's "model not found / retired" answers, which warrant re-discovery. */
export function isGeminiModelGone(message: string): boolean {
  return /404|not found|no longer available|is not supported/i.test(message);
}

/** Exported for tests. */
export const __rankGemini = rankGemini;

class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    try {
      return await this.callOnce(messages, opts);
    } catch (err) {
      // Model retired since we cached it → discover again and retry once.
      if (!isGeminiModelGone((err as Error).message)) throw err;
      invalidateGeminiModel(this.apiKey, "text");
      return this.callOnce(messages, opts);
    }
  }

  private async callOnce(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    const model = await resolveGeminiModel(this.apiKey, this.model, "text");
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.8,
          maxOutputTokens: opts?.maxTokens ?? 800,
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini: ${await readError(res)}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }
}

/** Every configured provider, the active one first (fallback order). */
export function orderedProviderIds(ai: AppConfig["integrations"]["ai"]): AiProviderId[] {
  const first = selectProviderId(ai);
  if (!first) return [];
  const rest: AiProviderId[] = ["gemini", "openai", "anthropic"];
  const configured = { openai: Boolean(ai.openai), anthropic: Boolean(ai.anthropic), gemini: Boolean(ai.gemini) };
  return [first, ...rest.filter((id) => id !== first && configured[id])];
}

/**
 * Errors that mean "THIS provider can't serve right now" (no credits, bad key,
 * rate limit, outage) — worth trying the next configured provider for.
 */
export function isProviderUnavailable(err: unknown): boolean {
  const low = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /\b(401|403|429|5\d\d)\b|quota|billing|invalid api key|incorrect api key|overloaded|unavailable/.test(low);
}

/**
 * Instantiate the active provider, or `null` when none is configured. When
 * several keys are configured, the returned provider falls back to the next
 * one whenever the current fails for account/availability reasons (e.g. an
 * OpenAI key without credits → Gemini), so "mejorar texto" keeps working.
 */
export function createProvider(ai: AppConfig["integrations"]["ai"]): AiProvider | null {
  const ids = orderedProviderIds(ai);
  const providers = ids.map((id) => instantiate(ai, id)).filter((p): p is AiProvider => Boolean(p));
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!;
  const primary = providers[0]!;
  return {
    id: primary.id,
    model: primary.model,
    async complete(messages, opts) {
      let last: unknown;
      for (const p of providers) {
        try {
          return await p.complete(messages, opts);
        } catch (err) {
          last = err;
          if (!isProviderUnavailable(err)) throw err;
        }
      }
      throw last;
    },
  };
}

function instantiate(ai: AppConfig["integrations"]["ai"], id: AiProviderId): AiProvider | null {
  switch (id) {
    case "openai":
      return new OpenAiProvider(ai.openai!, ai.models.openai);
    case "anthropic":
      return new AnthropicProvider(ai.anthropic!, ai.models.anthropic);
    case "gemini":
      return new GeminiProvider(ai.gemini!, ai.models.gemini);
    default:
      return null;
  }
}

// ── Image generation (flyers) ─────────────────────────────────────────────────

/** Minimal image-generation contract. Returns a `data:` URL (base64 PNG). */
export interface ImageProvider {
  readonly model: string;
  generateImage(prompt: string, size: string): Promise<string>;
}

class OpenAiImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generateImage(prompt: string, size: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, prompt, size, n: 1 }),
    });
    if (!res.ok) throw new Error(`OpenAI Images: ${await readError(res)}`);
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = data.data?.[0];
    if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
    if (first?.url) return first.url;
    throw new Error("OpenAI Images: respuesta vacía.");
  }
}

/** Gemini image generation ("Nano Banana"): returns the first inline PNG as a data: URL. */
class GeminiImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generateImage(prompt: string, size: string): Promise<string> {
    try {
      return await this.generateOnce(prompt, size);
    } catch (err) {
      if (!isGeminiModelGone((err as Error).message)) throw err;
      invalidateGeminiModel(this.apiKey, "image");
      return this.generateOnce(prompt, size);
    }
  }

  private async generateOnce(prompt: string, size: string): Promise<string> {
    const model = await resolveGeminiModel(this.apiKey, this.model, "image");
    const orientation =
      size === "1024x1536" ? "formato vertical 2:3 (story)" : size === "1536x1024" ? "formato horizontal 3:2" : "formato cuadrado 1:1";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Genera un flyer publicitario, ${orientation}, sin texto ilegible: ${prompt}` }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });
    if (!res.ok) throw new Error(`Gemini Images: ${await readError(res)}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error("Gemini Images: el modelo no devolvió imagen.");
    return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
  }
}

/**
 * Image generation for flyers: Gemini (gemini-2.5-flash-image) when a Gemini
 * key exists — the assistant runs on Gemini — otherwise OpenAI's gpt-image-1.
 * Returns null when neither is configured.
 */
export function createImageProvider(ai: AppConfig["integrations"]["ai"]): ImageProvider | null {
  if (ai.gemini) return new GeminiImageProvider(ai.gemini, "auto");
  if (ai.openai) return new OpenAiImageProvider(ai.openai, "gpt-image-1");
  return null;
}

/** The Gemini text provider alone (the assistant must run ONLY on Gemini). */
export function createGeminiProvider(ai: AppConfig["integrations"]["ai"]): AiProvider | null {
  return ai.gemini ? new GeminiProvider(ai.gemini, ai.models.gemini) : null;
}
