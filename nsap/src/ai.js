/**
 * Generación de texto con IA (OpenAI / Anthropic / Gemini) sobre fetch, sin SDKs.
 * Elige proveedor por AI_PROVIDER o por prioridad según la clave disponible.
 * Sin claves → lanza un error claro (503 arriba).
 */
const MODELS = {
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
  gemini: process.env.GEMINI_MODEL || "gemini-1.5-flash",
};

export function selectProvider() {
  const keys = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  const explicit = process.env.AI_PROVIDER;
  if (explicit && keys[explicit]) return explicit;
  return ["anthropic", "openai", "gemini"].find((p) => keys[p]) ?? null;
}

export function aiConfigured() {
  return selectProvider() !== null;
}

async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODELS.openai, messages, temperature: 0.8, max_tokens: 600 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content?.trim() ?? "";
}
async function callAnthropic(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELS.anthropic, max_tokens: 600, temperature: 0.8, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const d = await res.json();
  return (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}
async function callGemini(system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const d = await res.json();
  return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).join("").trim();
}

/** Genera un mensaje de marketing a partir de un brief + tono. */
export async function generateMessage({ prompt, tone = "cercano" }) {
  const provider = selectProvider();
  if (!provider) {
    throw Object.assign(
      new Error("IA no configurada. Define OPENAI_API_KEY, ANTHROPIC_API_KEY o GEMINI_API_KEY."),
      { status: 503 },
    );
  }
  const system =
    "Eres un copywriter de WhatsApp marketing. Escribe un mensaje breve, claro y " +
    "listo para enviar a un grupo. Puedes usar variables como {{grupo}} si aporta. " +
    "Devuelve solo el mensaje, sin comillas ni explicaciones.";
  const user = `Tono: ${tone}\nBrief: ${prompt}`;
  if (provider === "openai") {
    return callOpenAI([{ role: "system", content: system }, { role: "user", content: user }]);
  }
  if (provider === "anthropic") return callAnthropic(system, user);
  return callGemini(system, user);
}
