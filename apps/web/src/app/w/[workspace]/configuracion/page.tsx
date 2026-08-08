
import { useSearchParams } from "react-router-dom";
import { PERMISSION_MATRIX, ROLE_DESCRIPTIONS, ROLE_ORDER } from "@nv/domain";
import { Check, Minus, ScrollText } from "lucide-react";

import { useAuditLogs, useRoles } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamTab } from "@/components/settings/team-tab";
import { BillingTab } from "@/components/settings/billing-tab";

const TABS = ["equipo", "roles", "permisos", "facturacion", "logs"] as const;

export default function ConfiguracionPage() {
  const logs = useAuditLogs();
  const roles = useRoles();
  const roleCount = (name: string) =>
    (roles.data ?? []).find((r) => r.name === name)?.userCount ?? 0;

  // Tab is URL-driven so links like `?tab=facturacion` (e.g. the AI upgrade CTA) land here.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = TABS.includes(requested as (typeof TABS)[number]) ? requested! : "equipo";
  const onTabChange = (value: string) =>
    setSearchParams((prev) => {
      prev.set("tab", value);
      return prev;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Equipo, roles, permisos y auditoría de tu workspace."
      />

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Team */}
        <TabsContent value="equipo">
          <TeamTab />
        </TabsContent>

        {/* Roles */}
        <TabsContent value="roles">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLE_ORDER.map((role) => {
              const count = roleCount(role);
              return (
                <div key={role} className="nv-panel p-4">
                  <div className="text-sm font-semibold text-ink-bright">{role}</div>
                  <p className="mt-1 text-xs text-ink-muted">{ROLE_DESCRIPTIONS[role]}</p>
                  <div className="mt-3 text-[11px] text-ink-faint">
                    {count === 0
                      ? "Sin usuarios asignados"
                      : `${count} ${count === 1 ? "usuario" : "usuarios"}`}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Permission matrix (structural policy) */}
        <TabsContent value="permisos">
          <Panel className="overflow-hidden">
            <PanelHeader title="Matriz de permisos" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-faint">
                    <th className="px-4 py-3 font-medium">Permiso</th>
                    {ROLE_ORDER.map((r) => (
                      <th key={r} className="px-4 py-3 text-center font-medium">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MATRIX.map((row) => (
                    <tr key={row.permission} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink-soft">{row.permission}</td>
                      {ROLE_ORDER.map((r) => (
                        <td key={r} className="px-4 py-3 text-center">
                          {row.allowed[r] ? (
                            <Check className="mx-auto size-4 text-state-success" />
                          ) : (
                            <Minus className="mx-auto size-4 text-ink-faint" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="facturacion">
          <BillingTab />
        </TabsContent>

        {/* Audit logs */}
        <TabsContent value="logs">
          <Panel>
            <PanelHeader title="Auditoría & logs" />
            <div className="p-4">
              {logs.isLoading ? (
                <ListSkeleton rows={4} />
              ) : (logs.data ?? []).length === 0 ? (
                <EmptyState
                  icon={ScrollText}
                  title="Sin registros"
                  description="Cada acción en el workspace quedará registrada aquí para auditoría."
                  compact
                />
              ) : (
                <ul className="divide-y divide-line">
                  {(logs.data ?? []).map((log) => (
                    <li key={log.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-raised text-ink-muted">
                        <ScrollText className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-ink">
                          <span className="font-medium">{log.actor}</span>{" "}
                          <span className="text-ink-muted">{log.action}</span>
                          {log.target ? (
                            <span className="text-ink-faint"> · {log.target}</span>
                          ) : null}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
