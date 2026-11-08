import { MODULE_META, type AdminPanelSession } from "@nv/domain";

/** A visit pinged within this window counts as «en el panel ahora». */
export const LIVE_MS = 3 * 60_000;
const BEAT_MS = 60_000;

export const DEVICE_KIND_LABEL: Record<AdminPanelSession["deviceKind"], string> = {
  movil: "Móvil",
  tablet: "Tablet",
  computadora: "Computadora",
};

const EXTRA_SECTIONS: Record<string, string> = {
  inicio: "Inicio",
  dashboard: "Inicio",
  perfil: "Mi perfil",
  admin: "Admin",
  plan: "Mi plan",
  tareas: "Tareas",
  tienda: "Tienda",
  cobros: "Cobros",
  historial: "Historial",
  informes: "Informes",
  instalar: "Instalar la app",
  onboarding: "Primeros pasos",
  demo: "Demo",
};

/** «campanas» → «Campañas». */
export function sectionLabel(key: string): string {
  return (
    EXTRA_SECTIONS[key] ??
    (MODULE_META as Record<string, { label: string } | undefined>)[key]?.label ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

/** Section of a panel route (same rule as the server). */
export function sectionOfPath(path: string | null): string {
  if (!path) return "inicio";
  const clean = path.split(/[?#]/)[0] ?? "/";
  const ws = /^\/w\/[^/]+(?:\/([^/]+))?/.exec(clean);
  if (ws) return ws[1] ?? "dashboard";
  return clean.split("/").filter(Boolean)[0] ?? "inicio";
}

/** Time spent in a visit: first to last ping, plus the minute after it. */
export function visitMs(s: Pick<AdminPanelSession, "startedAt" | "lastAt">): number {
  return Math.max(0, new Date(s.lastAt).getTime() - new Date(s.startedAt).getTime()) + BEAT_MS;
}

/** «45 s», «12 min», «1 h 05 min». */
export function durationLabel(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export function isLive(s: Pick<AdminPanelSession, "lastAt">, now = Date.now()): boolean {
  return now - new Date(s.lastAt).getTime() <= LIVE_MS;
}

export interface UserUsage {
  visits: number;
  ms: number;
  devices: string[];
  pageViews: number;
}

/** Totals for the «Usuarios y actividad» screen. */
export function activitySummary(sessions: AdminPanelSession[], now = Date.now()) {
  const byUser = new Map<string, UserUsage>();
  const byKind = new Map<string, number>();
  const byDevice = new Map<string, number>();
  const bySection = new Map<string, number>();
  let live = 0;
  let demoVisits = 0;
  for (const s of sessions) {
    if (isLive(s, now)) live += 1;
    if (s.demo) demoVisits += 1;
    const u = byUser.get(s.userId) ?? { visits: 0, ms: 0, devices: [], pageViews: 0 };
    u.visits += 1;
    u.ms += visitMs(s);
    u.pageViews += s.pageViews;
    if (!u.devices.includes(s.device)) u.devices.push(s.device);
    byUser.set(s.userId, u);
    byKind.set(s.deviceKind, (byKind.get(s.deviceKind) ?? 0) + 1);
    byDevice.set(s.device, (byDevice.get(s.device) ?? 0) + 1);
    for (const [k, n] of Object.entries(s.sections)) {
      const label = sectionLabel(k);
      bySection.set(label, (bySection.get(label) ?? 0) + n);
    }
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    live,
    demoVisits,
    byUser,
    byKind: sorted(byKind).map(([k, n]) => [DEVICE_KIND_LABEL[k as AdminPanelSession["deviceKind"]] ?? k, n] as const),
    byDevice: sorted(byDevice),
    bySection: sorted(bySection),
  };
}
