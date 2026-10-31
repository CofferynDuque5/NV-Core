/**
 * Two letters for an avatar: «Visitante (demo)» → "VD", «Demo · Tienda» → "DT",
 * «ana.perez@mail.com» → "AP". Only letters and digits count, so brackets,
 * dots or emoji never show up.
 */
export function initialsOf(nameOrEmail: string | null | undefined, fallback = "NV"): string {
  const base = String(nameOrEmail ?? "").split("@")[0] ?? "";
  const words = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const first = words[0];
  if (!first) return fallback;
  const second = words[1];
  const letters = second ? [...first][0]! + [...second][0]! : [...first].slice(0, 2).join("");
  return letters.toUpperCase();
}
