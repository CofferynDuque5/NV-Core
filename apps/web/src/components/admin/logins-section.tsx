import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LayoutGrid, Monitor, Search, Smartphone, Tablet, Users } from "lucide-react";
import type { AdminLoginEvent, AdminLoginUser, AdminPanelSession } from "@nv/domain";

import { useServices } from "@/hooks/use-services";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DEVICE_KIND_LABEL,
  activitySummary,
  durationLabel,
  isLive,
  sectionLabel,
  sectionOfPath,
  visitMs,
} from "@/lib/panel-activity";

const DAY = 86_400_000;

const METHOD_LABEL: Record<string, string> = {
  password: "Contraseña",
  register: "Se registró",
  demo: "Demo",
  failed: "Contraseña incorrecta",
};

/** "hace 5 min", "hace 3 h", "hace 2 días" — or the date when it's older. */
export function sinceLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Nunca";
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return "Ahora";
  if (ms < 3_600_000) return `Hace ${Math.floor(ms / 60_000)} min`;
  if (ms < DAY) return `Hace ${Math.floor(ms / 3_600_000)} h`;
  if (ms < 7 * DAY) return `Hace ${Math.floor(ms / DAY)} ${Math.floor(ms / DAY) === 1 ? "día" : "días"}`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

/** Headline numbers of the panel: real users only (the demo account aside). */
export function loginStats(users: AdminLoginUser[], events: AdminLoginEvent[], now = Date.now()) {
  const real = users.filter((u) => !u.demo);
  const seenWithin = (ms: number) =>
    real.filter((u) => {
      const t = u.lastSeenAt ?? u.lastLoginAt;
      return t ? now - new Date(t).getTime() <= ms : false;
    }).length;
  return {
    users: real.length,
    newThisWeek: real.filter((u) => now - new Date(u.createdAt).getTime() <= 7 * DAY).length,
    activeToday: seenWithin(DAY),
    activeWeek: seenWithin(7 * DAY),
    demoVisitsWeek: events.filter((e) => e.method === "demo" && now - new Date(e.at).getTime() <= 7 * DAY).length,
  };
}

/** Who signs in and uses the panel: live now, users, visits, demo, devices and sign-ins. */
export function LoginsSection({ enabled }: { enabled: boolean }) {
  const svc = useServices();
  const [days, setDays] = React.useState(7);
  const logins = useQuery({ queryKey: ["admin", "logins"], queryFn: () => svc.admin.logins(), enabled, refetchInterval: 60_000 });
  const activity = useQuery({
    queryKey: ["admin", "activity", days],
    queryFn: () => svc.admin.activity(days),
    enabled,
    refetchInterval: 30_000,
  });
  const [q, setQ] = React.useState("");
  const [openUser, setOpenUser] = React.useState<string | null>(null);
  const users = logins.data?.users ?? [];
  const events = logins.data?.events ?? [];
  const sessions = activity.data?.sessions ?? [];
  const stats = loginStats(users, events);
  const usage = activitySummary(sessions);
  const now = Date.now();
  const live = sessions.filter((s) => isLive(s, now));
  const needle = q.trim().toLowerCase();
  const match = (text: string) => !needle || text.toLowerCase().includes(needle);
  const shownUsers = users.filter((u) => match(`${u.name} ${u.email} ${u.workspaces.join(" ")}`));
  const realVisits = sessions.filter((s) => !s.demo && match(`${s.name} ${s.email} ${s.device} ${s.ip ?? ""} ${s.workspaceSlug ?? ""}`));
  const demoVisits = sessions.filter((s) => s.demo && match(`${s.device} ${s.ip ?? ""}`));
  const shownEvents = events.filter((e) => match(`${e.name} ${e.email} ${e.device} ${e.ip ?? ""} ${METHOD_LABEL[e.method] ?? e.method}`));

  return (
    <section className="nv-panel space-y-4 p-4" data-testid="admin-logins">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink-bright">Usuarios y actividad</h2>
          <p className="text-xs text-ink-muted">
            Quién entra, quién usa el panel y cuánto tiempo, desde qué equipo, quién mira la demo y los intentos fallidos.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Período
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Período"
            className="h-8 rounded-lg border border-line-soft bg-panel-raised px-2 text-xs text-ink"
          >
            <option value={1}>Hoy (24 h)</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="En el panel ahora" value={live.length} highlight={live.length > 0} />
        <Stat label="Activos hoy" value={stats.activeToday} />
        <Stat label="Usuarios" value={stats.users} />
        <Stat label="Nuevos (7 días)" value={stats.newThisWeek} />
        <Stat label="Visitas a la demo" value={usage.demoVisits} />
        <Stat label="Contraseñas incorrectas" value={activity.data?.failedLogins ?? 0} />
      </dl>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, correo, marca, equipo o IP…"
          aria-label="Buscar en la actividad"
          className="h-9 pl-8"
        />
      </div>

      <Tabs defaultValue="vivo">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="vivo">En vivo ({live.length})</TabsTrigger>
            <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
            <TabsTrigger value="visitas">Visitas</TabsTrigger>
            <TabsTrigger value="demo">Demo ({demoVisits.length})</TabsTrigger>
            <TabsTrigger value="equipos">Equipos y secciones</TabsTrigger>
            <TabsTrigger value="accesos">Inicios de sesión</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="vivo">
          {live.length === 0 ? (
            <p className="text-xs text-ink-faint">Nadie tiene el panel abierto en este momento.</p>
          ) : (
            <VisitList sessions={live} now={now} live />
          )}
        </TabsContent>

        <TabsContent value="usuarios">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-3 font-medium">Usuario</th>
                  <th className="py-2 pr-3 font-medium">Se registró</th>
                  <th className="py-2 pr-3 font-medium">Último inicio de sesión</th>
                  <th className="py-2 pr-3 font-medium">Última vez activo</th>
                  <th className="py-2 pr-3 font-medium">Tiempo en el panel</th>
                  <th className="py-2 pr-3 font-medium">Equipos</th>
                  <th className="py-2 font-medium">Marcas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {shownUsers.map((u) => {
                  const use = usage.byUser.get(u.id);
                  const open = openUser === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr data-testid="admin-login-user" className="align-top">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => setOpenUser(open ? null : u.id)}
                            aria-expanded={open}
                            className="text-left"
                          >
                            <span className="flex items-center gap-1 font-medium text-ink-bright">
                              <ChevronRight className={cn("size-3.5 text-ink-faint transition-transform", open && "rotate-90")} />
                              {u.name || u.email}
                              {u.demo ? <span className="ml-1 rounded-full border border-brand/40 px-1.5 text-[10px] text-brand">demo</span> : null}
                              {sessions.some((s) => s.userId === u.id && isLive(s, now)) ? (
                                <span className="ml-1 rounded-full bg-state-success/15 px-1.5 text-[10px] text-state-success">en línea</span>
                              ) : null}
                            </span>
                            <span className="block pl-[18px] text-xs text-ink-muted">
                              {u.email}
                              {!u.demo && !u.emailVerified ? " · correo sin verificar" : ""}
                            </span>
                          </button>
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-muted">{sinceLabel(u.createdAt)}</td>
                        <td className="py-2 pr-3 text-xs text-ink">
                          {sinceLabel(u.lastLoginAt)}
                          <span className="block text-ink-faint">{u.loginCount} {u.loginCount === 1 ? "acceso" : "accesos"}</span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink">{sinceLabel(u.lastSeenAt ?? u.lastLoginAt)}</td>
                        <td className="py-2 pr-3 text-xs text-ink">
                          {use ? durationLabel(use.ms) : "—"}
                          {use ? <span className="block text-ink-faint">{use.visits} {use.visits === 1 ? "visita" : "visitas"} · {use.pageViews} páginas</span> : null}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-muted">{use ? use.devices.join(", ") : "—"}</td>
                        <td className="py-2 text-xs text-ink-muted">{u.workspaces.join(", ") || "—"}</td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={7} className="bg-panel-raised/50 px-3 py-2">
                            {sessions.some((s) => s.userId === u.id) ? (
                              <VisitList sessions={sessions.filter((s) => s.userId === u.id)} now={now} hideUser />
                            ) : (
                              <p className="text-xs text-ink-faint">No usó el panel en este período.</p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {shownUsers.length === 0 ? (
              <p className="py-4 text-xs text-ink-faint">{logins.isLoading ? "Cargando…" : "Nadie coincide con la búsqueda."}</p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="visitas">
          {realVisits.length === 0 ? (
            <p className="text-xs text-ink-faint">{activity.isLoading ? "Cargando…" : "No hay visitas en este período."}</p>
          ) : (
            <VisitList sessions={realVisits} now={now} />
          )}
        </TabsContent>

        <TabsContent value="demo">
          <p className="mb-2 text-xs text-ink-muted">
            Todos entran a la demo con la misma cuenta: cada visita es una persona distinta (se reconoce por su equipo e IP).
          </p>
          {demoVisits.length === 0 ? (
            <p className="text-xs text-ink-faint">Nadie miró la demo en este período.</p>
          ) : (
            <VisitList sessions={demoVisits} now={now} hideUser />
          )}
        </TabsContent>

        <TabsContent value="equipos">
          <div className="grid gap-4 md:grid-cols-3">
            <Bars title="Tipo de equipo" icon={<Smartphone className="size-4 text-brand" />} rows={usage.byKind} unit={["visita", "visitas"]} />
            <Bars title="Navegador y sistema" icon={<Monitor className="size-4 text-brand" />} rows={usage.byDevice} unit={["visita", "visitas"]} />
            <Bars title="Secciones más usadas" icon={<LayoutGrid className="size-4 text-brand" />} rows={usage.bySection.slice(0, 12)} unit={["página", "páginas"]} />
          </div>
        </TabsContent>

        <TabsContent value="accesos">
          {shownEvents.length === 0 ? (
            <p className="text-xs text-ink-faint">Todavía no hay inicios de sesión registrados.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-line-soft overflow-y-auto">
              {shownEvents.slice(0, 200).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs" data-testid="admin-login-event">
                  <span className="w-28 shrink-0 text-ink-muted" title={new Date(e.at).toLocaleString("es")}>
                    {sinceLabel(e.at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    <b className="font-medium">{e.name || e.email}</b> <span className="text-ink-muted">{e.email}</span>
                  </span>
                  <span className={e.method === "failed" ? "font-medium text-state-danger" : "text-ink-muted"}>
                    {METHOD_LABEL[e.method] ?? e.method}
                  </span>
                  <span className="text-ink-muted">{e.device}</span>
                  <span className="text-ink-faint">{e.ip ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** Visits as rows: who, device, IP, brand, sections, when and how long. */
function VisitList({
  sessions,
  now,
  live = false,
  hideUser = false,
}: {
  sessions: AdminPanelSession[];
  now: number;
  live?: boolean;
  hideUser?: boolean;
}) {
  return (
    <ul className="max-h-[28rem] divide-y divide-line-soft overflow-y-auto" data-testid="admin-visits">
      {sessions.slice(0, 300).map((s) => {
        const KindIcon = s.deviceKind === "movil" ? Smartphone : s.deviceKind === "tablet" ? Tablet : Monitor;
        const sections = Object.entries(s.sections).sort((a, b) => b[1] - a[1]);
        return (
          <li key={s.id} className="grid gap-1 py-2 text-xs sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center sm:gap-3" data-testid="admin-visit">
            <div className="min-w-0">
              {hideUser ? null : (
                <p className="truncate font-medium text-ink-bright">
                  {s.demo ? "Visitante de la demo" : s.name || s.email}
                  {s.demo ? null : <span className="ml-1 font-normal text-ink-muted">{s.email}</span>}
                </p>
              )}
              <p className="flex items-center gap-1 text-ink-muted">
                <KindIcon className="size-3.5 shrink-0" aria-label={DEVICE_KIND_LABEL[s.deviceKind]} />
                {s.device}
                {s.ip ? <span className="text-ink-faint">· IP {s.ip}</span> : null}
              </p>
            </div>
            <div className="text-ink-muted">
              {live ? (
                <span className="font-medium text-state-success">Ahora en {sectionLabel(sectionOfPath(s.lastPath))}</span>
              ) : (
                <span title={new Date(s.startedAt).toLocaleString("es")}>{sinceLabel(s.startedAt, now)}</span>
              )}
              {s.workspaceSlug ? <span className="block text-ink-faint">Marca: {s.workspaceSlug}</span> : null}
            </div>
            <div className="flex min-w-0 flex-wrap gap-1">
              {sections.map(([k, n]) => (
                <span key={k} className="rounded-full border border-line-soft px-1.5 py-0.5 text-[11px] text-ink-muted">
                  {sectionLabel(k)}
                  {n > 1 ? ` ×${n}` : ""}
                </span>
              ))}
            </div>
            <div className="text-ink sm:text-right">
              {durationLabel(visitMs(s))}
              <span className="block text-ink-faint">{s.pageViews} {s.pageViews === 1 ? "página" : "páginas"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Bars({
  title,
  icon,
  rows,
  unit,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ReadonlyArray<readonly [string, number]>;
  /** Singular and plural. */
  unit: readonly [string, string];
}) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div className="space-y-2 rounded-lg border border-line-soft bg-panel-raised p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-bright">
        {icon} {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint">Sin datos en este período.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(([label, n]) => (
            <li key={label} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate text-ink">{label}</span>
                <span className="shrink-0 text-ink-muted">
                  {n} {n === 1 ? unit[0] : unit[1]}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-panel-raised px-3 py-2", highlight ? "border-state-success/50" : "border-line-soft")}>
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="text-lg font-semibold text-ink-bright">{value}</dd>
    </div>
  );
}
