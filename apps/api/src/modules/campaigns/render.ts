/**
 * Message rendering for campaigns: replaces {{key}} placeholders with values.
 * Built-in variables ({{grupo}}, {{fecha}}, {{hora}}) plus per-group variables.
 */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return String(body ?? "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Built-in variables available to every group. */
export function builtinVars(groupName: string): Record<string, string> {
  const now = new Date();
  return {
    grupo: groupName,
    fecha: now.toLocaleDateString("es-ES"),
    hora: now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
}
