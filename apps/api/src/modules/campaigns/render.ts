/**
 * Message rendering for campaigns: replaces {{key}} placeholders with values.
 * Built-in variables ({{grupo}}, {{fecha}}, {{hora}}, {{dia}}, {{saludo}},
 * {{nombre_marca}}) plus per-group variables, and spintax {Hola|Buenas}.
 */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return spin(String(body ?? "")).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Spintax: «{Hola|Buenas|Qué tal}» becomes one of the options, at random, so
 * each group gets a slightly different text. {{variables}} are left alone.
 */
export function spin(text: string, random: () => number = Math.random): string {
  return text.replace(/(?<!\{)\{([^{}]*\|[^{}]*)\}(?!\})/g, (_m, inner: string) => {
    const options = inner.split("|");
    return options[Math.floor(random() * options.length)] ?? "";
  });
}

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Built-in variables available to every group, in the brand's time zone. */
export function builtinVars(
  groupName: string,
  opts: { timeZone?: string; brandName?: string; now?: Date } = {},
): Record<string, string> {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? now.getHours());
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? "",
  );
  const saludo = hour >= 5 && hour < 12 ? "buenos días" : hour >= 12 && hour < 19 ? "buenas tardes" : "buenas noches";
  return {
    grupo: groupName,
    fecha: now.toLocaleDateString("es-ES", { timeZone: tz }),
    hora: now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz }),
    dia: DAYS[wd >= 0 ? wd : now.getDay()]!,
    saludo,
    nombre_marca: opts.brandName ?? "",
  };
}
