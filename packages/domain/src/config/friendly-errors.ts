/**
 * Plain-language explanations for the errors that WhatsApp, Telegram, Meta
 * and the panel itself can report. The raw text stays in the Historial for
 * whoever needs it; alerts and notices show these instead.
 */
export interface FriendlyError {
  /** What happened, in one short sentence. */
  title: string;
  /** What the user can do about it. */
  hint: string;
}

const RULES: [RegExp, FriendlyError][] = [
  // Telegram
  [
    /could not find the input entity|peer_id_invalid|channel_invalid|chat_id_invalid/i,
    {
      title: "Ese grupo ya no está en tu Telegram (saliste, lo borraron o cambió).",
      hint: "Pulsa «Sincronizar» en Conexiones › Telegram y vuelve a elegir los grupos de la campaña.",
    },
  ],
  [
    /chat_write_forbidden|user_banned_in_channel|chat_admin_required|chat_restricted/i,
    {
      title: "En ese grupo no tienes permiso para escribir.",
      hint: "Pide a un administrador que te deje publicar o aparta el grupo en Grupos.",
    },
  ],
  [
    /chat_send_(media|photos|videos)_forbidden/i,
    {
      title: "Ese grupo no deja enviar fotos ni videos.",
      hint: "Envía la campaña solo con texto a ese grupo o apártalo.",
    },
  ],
  [
    /channel_private|invite_hash_expired|user_not_participant|not a participant|not in (the )?group/i,
    {
      title: "Ya no eres miembro de ese grupo.",
      hint: "Vuelve a unirte o quítalo de la campaña.",
    },
  ],
  [
    /flood_wait|slowmode_wait|rate-?overlimit|too many requests|throttled/i,
    {
      title: "Se enviaron demasiados mensajes seguidos y la app pidió esperar.",
      hint: "No hay que hacer nada: vuelve a lanzar la campaña más tarde o con más pausa entre grupos.",
    },
  ],
  [
    /auth_key_unregistered|session_revoked|session_expired|telegram no está conectado/i,
    {
      title: "Tu Telegram se desconectó del panel.",
      hint: "Ve a Conexiones › Telegram y vuelve a conectarlo con el QR.",
    },
  ],
  // WhatsApp
  [
    /not-authorized|whatsapp.*no está conectado|logged ?out|connection (closed|lost)|conexión cerrada/i,
    {
      title: "Tu WhatsApp se desconectó del panel.",
      hint: "Ve a Conexiones › WhatsApp y vuelve a escanear el QR.",
    },
  ],
  [
    /\bforbidden\b|sin permiso|403/i,
    {
      title: "En ese grupo solo pueden escribir los administradores, o te sacaron.",
      hint: "Revisa el grupo en tu teléfono o apártalo en Grupos.",
    },
  ],
  [
    /item-not-found|group.*not found|404/i,
    {
      title: "Ese grupo ya no existe o ya no estás en él.",
      hint: "Pulsa «Sincronizar grupos» y quítalo de la campaña.",
    },
  ],
  [
    /la imagen no se pudo enviar|media upload failed|no se pudo descargar|archivo vacío|data url inválida|http \d{3} al descargar/i,
    {
      title: "La imagen o el archivo no se pudo enviar.",
      hint: "Vuelve a subir la imagen a la campaña (JPG o PNG, menos de 5 MB).",
    },
  ],
  [
    /timed? ?out|tiempo de espera agotado|etimedout|econnreset|socket hang up|red no disponible/i,
    {
      title: "La conexión tardó demasiado y el envío no salió.",
      hint: "Revisa que el servidor y tu teléfono tengan internet y vuelve a intentarlo.",
    },
  ],
  // Meta (Facebook / Instagram)
  [
    /token vencido|session has expired|error validating access token|oauthexception|code"?:\s*190/i,
    {
      title: "El permiso de Facebook/Instagram venció.",
      hint: "Ve a Conexiones y vuelve a conectar Facebook e Instagram.",
    },
  ],
  [
    /instagram requiere una imagen|un reel requiere un video|carrusel requiere/i,
    {
      title: "Instagram necesita una imagen o un video para publicar.",
      hint: "Añade una imagen a la campaña o quita Instagram de los canales.",
    },
  ],
  [
    /(facebook|instagram|app de meta) no configurad/i,
    {
      title: "Facebook o Instagram no están conectados.",
      hint: "Conéctalos en Conexiones antes de publicar ahí.",
    },
  ],
  [
    /sin conectar|no está conectado/i,
    {
      title: "Ese canal no está conectado al panel.",
      hint: "Conéctalo en Conexiones y vuelve a lanzar la campaña.",
    },
  ],
  [
    /el mensaje está vacío/i,
    { title: "La campaña no tiene mensaje.", hint: "Escribe el texto de la campaña y guárdala." },
  ],
  [
    /proveedor caído|unexpected|internal server error|500/i,
    {
      title: "El servicio de envío falló por un momento.",
      hint: "Vuelve a intentarlo en unos minutos. Si sigue pasando, revisa Conexiones.",
    },
  ],
];

const FALLBACK: FriendlyError = {
  title: "El envío no salió por un error inesperado.",
  hint: "Vuelve a intentarlo. Si se repite, el detalle técnico está en Historial.",
};

/** Plain explanation of a raw error message from any channel. */
export function explainError(raw: string | null | undefined): FriendlyError {
  const text = String(raw ?? "");
  for (const [re, friendly] of RULES) if (re.test(text)) return friendly;
  return FALLBACK;
}

/** Plain explanation of why a group was skipped (the reasons from groupPostingProblems). */
export function explainSkip(reason: string): string {
  if (/no sabemos de qué país/i.test(reason)) return "no tienen país y el mensaje usa {{precio}} (indícalo en Grupos)";
  const currency = /no tiene precio en (.+?)\.?$/i.exec(reason);
  if (currency) return `la campaña no tiene precio en ${currency[1]}`;
  if (/apartado/i.test(reason)) return "están apartados";
  const category = /grupo de «(.+?)»/.exec(reason);
  if (category) return `son de «${category[1]}», donde no se publica publicidad`;
  if (/administradores/i.test(reason)) return "solo dejan escribir a los administradores";
  if (/publicidad|ventas/i.test(reason)) return "sus reglas prohíben publicidad";
  if (/foto|imagen/i.test(reason)) return "piden foto y la campaña no tiene";
  return "sus reglas no lo permiten";
}

/** Groups skipped in a run, summarised as «N grupos se saltaron porque …». */
export function summarizeSkips(omitted: { reason: string }[]): string {
  if (omitted.length === 0) return "";
  const byReason = new Map<string, number>();
  for (const o of omitted) {
    const key = explainSkip(o.reason);
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const parts = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${n} ${n === 1 ? "grupo" : "grupos"} porque ${why}`);
  return `Se saltaron ${parts.join("; ")}.`;
}

/**
 * Rewrites the technical parts of an alert written by an older version
 * («Motivo (grupo): Could not find…», «52 grupos omitidos: …») in plain words.
 * Text that is already plain comes back unchanged.
 */
export function simplifyNotice(text: string | null | undefined): string {
  let out = String(text ?? "");
  out = out.replace(
    /\s*Motivo(?: \(([^)]*)\))?:\s*([\s\S]*?)(?=\s+\d+ grupos? omitidos?:|\s+1 grupo omitido:|\s*Detalle en Historial\.|$)/,
    (_m, group: string | undefined, raw: string) => {
      const f = explainError(raw);
      return ` ${group ? `En «${group.trim()}»: ` : ""}${f.title} ${f.hint}`;
    },
  );
  out = out.replace(
    /\s*(\d+) grupos? omitidos?:\s*([\s\S]*?)(?=\s*Detalle en Historial\.|$)/,
    (_m, n: string, list: string) => {
      const reasons = [...list.matchAll(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((r) => r[1] ?? "");
      const first = reasons[0];
      const why = first ? explainSkip(first) : "sus reglas no lo permiten";
      return ` ${n} ${n === "1" ? "grupo se saltó" : "grupos se saltaron"}, por ejemplo porque ${why}.`;
    },
  );
  out = out.replace(/\s*1 grupo omitido:\s*([\s\S]*?)(?=\s*Detalle en Historial\.|$)/, (_m, list: string) => {
    const m = /\((.*)\)/.exec(list);
    return ` 1 grupo se saltó porque ${explainSkip(m?.[1] ?? "")}.`;
  });
  return out.replace(/\s{2,}/g, " ").trim();
}
