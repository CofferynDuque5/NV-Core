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
  const priority: AiProviderId[] = ["anthropic", "openai", "gemini"];
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

class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
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

/** Instantiate the active provider, or `null` when none is configured. */
export function createProvider(ai: AppConfig["integrations"]["ai"]): AiProvider | null {
  const id = selectProviderId(ai);
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

/**
 * Image generation for flyers. Uses OpenAI's images API (gpt-image-1), so it
 * needs OPENAI_API_KEY specifically — the text providers (Anthropic/Gemini) are
 * not used here. Returns null when no OpenAI key is configured.
 */
export function createImageProvider(ai: AppConfig["integrations"]["ai"]): ImageProvider | null {
  if (!ai.openai) return null;
  return new OpenAiImageProvider(ai.openai, "gpt-image-1");
}
