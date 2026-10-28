import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { LogIn, Search, Users } from "lucide-react";
import type { AdminLoginEvent, AdminLoginUser } from "@nv/domain";

import { useServices } from "@/hooks/use-services";
import { Input } from "@/components/ui/input";

const DAY = 86_400_000;

const METHOD_LABEL: Record<string, string> = {
  password: "Contraseña",
  register: "Se registró",
  demo: "Demo",
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

/** Who signs in to the panel: every user with their last access, and the latest sign-ins. */
export function LoginsSection({ enabled }: { enabled: boolean }) {
  const svc = useServices();
  const logins = useQuery({ queryKey: ["admin", "logins"], queryFn: () => svc.admin.logins(), enabled, refetchInterval: 60_000 });
  const [q, setQ] = React.useState("");
  const users = logins.data?.users ?? [];
  const events = logins.data?.events ?? [];
  const stats = loginStats(users, events);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? users.filter((u) => `${u.name} ${u.email} ${u.workspaces.join(" ")}`.toLowerCase().includes(needle))
    : users;

  return (
    <section className="nv-panel space-y-4 p-4" data-testid="admin-logins">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink-bright">Usuarios y accesos</h2>
          <p className="text-xs text-ink-muted">Quién se registró, cuándo entró por última vez y desde qué equipo.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Usuarios" value={stats.users} />
        <Stat label="Nuevos (7 días)" value={stats.newThisWeek} />
        <Stat label="Activos hoy" value={stats.activeToday} />
        <Stat label="Activos (7 días)" value={stats.activeWeek} />
        <Stat label="Visitas a la demo (7 días)" value={stats.demoVisitsWeek} />
      </dl>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o marca…" className="h-9 pl-8" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-3 font-medium">Usuario</th>
              <th className="py-2 pr-3 font-medium">Se registró</th>
              <th className="py-2 pr-3 font-medium">Último inicio de sesión</th>
              <th className="py-2 pr-3 font-medium">Última vez activo</th>
              <th className="py-2 pr-3 font-medium">Accesos</th>
              <th className="py-2 font-medium">Marcas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.map((u) => (
              <tr key={u.id} data-testid="admin-login-user">
                <td className="py-2 pr-3">
                  <p className="font-medium text-ink-bright">
                    {u.name || u.email}
                    {u.demo ? <span className="ml-2 rounded-full border border-brand/40 px-1.5 text-[10px] text-brand">demo</span> : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {u.email}
                    {!u.demo && !u.emailVerified ? " · correo sin verificar" : ""}
                  </p>
                </td>
                <td className="py-2 pr-3 text-xs text-ink-muted">{sinceLabel(u.createdAt)}</td>
                <td className="py-2 pr-3 text-xs text-ink">{sinceLabel(u.lastLoginAt)}</td>
                <td className="py-2 pr-3 text-xs text-ink">{sinceLabel(u.lastSeenAt ?? u.lastLoginAt)}</td>
                <td className="py-2 pr-3 text-xs text-ink">{u.loginCount}</td>
                <td className="py-2 text-xs text-ink-muted">{u.workspaces.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <p className="py-4 text-xs text-ink-faint">{logins.isLoading ? "Cargando…" : "Nadie coincide con la búsqueda."}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-bright">
          <LogIn className="size-4 text-brand" /> Últimos inicios de sesión
        </h3>
        {events.length === 0 ? (
          <p className="text-xs text-ink-faint">Todavía no hay inicios de sesión registrados.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto">
            {events.slice(0, 100).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs" data-testid="admin-login-event">
                <span className="w-28 shrink-0 text-ink-muted" title={new Date(e.at).toLocaleString("es")}>
                  {sinceLabel(e.at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  <b className="font-medium">{e.name || e.email}</b> <span className="text-ink-muted">{e.email}</span>
                </span>
                <span className="text-ink-muted">{METHOD_LABEL[e.method] ?? e.method}</span>
                <span className="text-ink-muted">{e.device}</span>
                <span className="text-ink-faint">{e.ip ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel-raised px-3 py-2">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="text-lg font-semibold text-ink-bright">{value}</dd>
    </div>
  );
}
