"use client";

import { PERMISSION_MATRIX, ROLE_DESCRIPTIONS, ROLE_ORDER } from "@nv/domain";
import { Check, Minus, ScrollText, UserPlus, Users } from "lucide-react";

import { useAuditLogs, useTeam } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConfiguracionPage() {
  const team = useTeam();
  const logs = useAuditLogs();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Equipo, roles, permisos y auditoría de tu workspace."
      />

      <Tabs defaultValue="equipo">
        <TabsList>
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Team */}
        <TabsContent value="equipo">
          <Panel>
            <PanelHeader
              title="Equipo"
              action={
                <Button size="sm">
                  <UserPlus className="size-4" /> Invitar
                </Button>
              }
            />
            <div className="p-4">
              {team.isLoading ? (
                <ListSkeleton rows={3} />
              ) : (
                <EmptyState
                  icon={Users}
                  title="Aún no hay miembros"
                  description="Invita a tu equipo para colaborar en campañas, contenido y automatizaciones."
                  action={
                    <Button size="sm">
                      <UserPlus className="size-4" /> Invitar miembro
                    </Button>
                  }
                  compact
                />
              )}
            </div>
          </Panel>
        </TabsContent>

        {/* Roles (structural) */}
        <TabsContent value="roles">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLE_ORDER.map((role) => (
              <div key={role} className="nv-panel p-4">
                <div className="text-sm font-semibold text-ink-bright">{role}</div>
                <p className="mt-1 text-xs text-ink-muted">{ROLE_DESCRIPTIONS[role]}</p>
                <div className="mt-3 text-[11px] text-ink-faint">Sin usuarios asignados</div>
              </div>
            ))}
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

        {/* Audit logs */}
        <TabsContent value="logs">
          <Panel>
            <PanelHeader title="Auditoría & logs" />
            <div className="p-4">
              {logs.isLoading ? (
                <ListSkeleton rows={4} />
              ) : (
                <EmptyState
                  icon={ScrollText}
                  title="Sin registros"
                  description="Cada acción en el workspace quedará registrada aquí para auditoría."
                  compact
                />
              )}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
