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

function requireProvider() {
  const provider = selectProvider();
  if (!provider) {
    throw Object.assign(
      new Error("IA no configurada. Define OPENAI_API_KEY, ANTHROPIC_API_KEY o GEMINI_API_KEY."),
      { status: 503 },
    );
  }
  return provider;
}

/** Envía system+user al proveedor activo y devuelve el texto. */
async function chat(system, user) {
  const provider = requireProvider();
  if (provider === "openai") {
    return callOpenAI([{ role: "system", content: system }, { role: "user", content: user }]);
  }
  if (provider === "anthropic") return callAnthropic(system, user);
  return callGemini(system, user);
}

/** Extrae un array JSON de la respuesta del modelo (tolera fences de código). */
function parseJsonArray(raw) {
  const cleaned = String(raw).replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1) {
    try {
      const arr = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* cae al fallback */
    }
  }
  // Fallback: una recomendación por línea no vacía.
  return cleaned
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((detalle) => ({ titulo: "Sugerencia", detalle, categoria: "otro" }));
}

/** Genera un mensaje de marketing a partir de un brief + tono. */
export async function generateMessage({ prompt, tone = "cercano" }) {
  const system =
    "Eres un copywriter de WhatsApp marketing. Escribe un mensaje breve, claro y " +
    "listo para enviar a un grupo. Puedes usar variables como {{grupo}} si aporta. " +
    "Devuelve solo el mensaje, sin comillas ni explicaciones.";
  return chat(system, `Tono: ${tone}\nBrief: ${prompt}`);
}

/** Mejora un mensaje existente manteniendo sus variables {{...}}. */
export async function improveMessage({ message, tone = "cercano" }) {
  if (!message || String(message).trim().length < 2) {
    throw Object.assign(new Error("Escribe un mensaje para mejorar."), { status: 400 });
  }
  const system =
    "Eres copywriter experto de WhatsApp marketing. Mejora el mensaje para que sea más " +
    "claro, persuasivo y con buen gancho, SIN inventar datos y MANTENIENDO intactas las " +
    "variables {{...}}. Devuelve solo el mensaje final.";
  return chat(system, `Tono: ${tone}\nMensaje a mejorar:\n${message}`);
}

/**
 * Recomendaciones accionables a partir del contexto (grupos, historial,
 * plantillas). Devuelve un array de { titulo, detalle, categoria }.
 */
export async function generateRecommendations({ groups = [], logs = [], templates = [] }) {
  const context = {
    grupos: groups.slice(0, 40).map((g) => ({ nombre: g.subject ?? g.name, miembros: g.size ?? g.members ?? 0 })),
    envios_recientes: logs.slice(0, 40).map((l) => ({
      campaña: l.campaignName,
      destino: l.groupName,
      ok: l.ok,
      fecha: l.at,
    })),
    plantillas: templates.map((t) => t.name),
  };
  const system =
    "Eres estratega de marketing por WhatsApp y redes. Analiza el contexto y da " +
    "recomendaciones accionables para mejorar alcance, engagement y conversión. " +
    "Responde ÚNICAMENTE con JSON válido: un array (máx 6) de objetos " +
    '{"titulo": string, "detalle": string, "categoria": "campaña"|"mensaje"|"segmentacion"|"horario"|"otro"}. ' +
    "Sé concreto y práctico, en español.";
  const user = `Contexto (JSON):\n${JSON.stringify(context)}\n\nDame las recomendaciones.`;
  const raw = await chat(system, user);
  return parseJsonArray(raw);
}

/**
 * Mejores horarios de envío según el historial (heurístico, NO usa IA):
 * cuenta los envíos OK por día de semana y por hora.
 */
export function bestSendTimes(logs = []) {
  const okLogs = logs.filter((l) => l.ok && l.at);
  const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const byDay = Array(7).fill(0);
  const byHour = Array(24).fill(0);
  for (const l of okLogs) {
    const d = new Date(l.at);
    if (Number.isNaN(d.getTime())) continue;
    byDay[d.getDay()]++;
    byHour[d.getHours()]++;
  }
  const topDay = byDay.some((n) => n > 0) ? DAYS[byDay.indexOf(Math.max(...byDay))] : null;
  const topHour = byHour.some((n) => n > 0) ? byHour.indexOf(Math.max(...byHour)) : null;
  return {
    sampleSize: okLogs.length,
    topDay,
    topHour: topHour === null ? null : `${String(topHour).padStart(2, "0")}:00`,
    byDay: DAYS.map((label, i) => ({ label, count: byDay[i] })),
  };
}
