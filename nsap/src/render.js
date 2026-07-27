/**
 * Sustituye variables `{{clave}}` en una plantilla con los valores de `vars`.
 * Las claves desconocidas se reemplazan por cadena vacía. Puro — con tests.
 */
export function renderTemplate(body, vars = {}) {
  return String(body ?? "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Variables integradas disponibles en cada envío. */
export function builtinVars(groupName, date = new Date()) {
  return {
    grupo: groupName ?? "",
    fecha: date.toLocaleDateString("es-ES"),
    hora: date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Lista las claves `{{...}}` usadas en una plantilla (para vista previa/ayuda). */
export function extractVars(body) {
  const found = new Set();
  for (const m of String(body ?? "").matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}
