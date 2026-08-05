
import * as React from "react";
import type { Group } from "@nv/domain";
import { Plus, Send, Settings2, Users } from "lucide-react";

import { useGroups } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroupCreateDialog } from "@/components/entities/group-create-dialog";
import { GroupVarsDialog } from "@/components/entities/group-vars-dialog";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

const COLUMNS = ["Grupo", "Miembros", "Estado", ""];

export function GruposContent({ showHeader = true }: { showHeader?: boolean }) {
  const groups = useGroups();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [varsGroup, setVarsGroup] = React.useState<Group | null>(null);
  const [campaignOpen, setCampaignOpen] = React.useState(false);

  const actions = (
    <>
      <Button variant="secondary" size="sm" onClick={() => setCampaignOpen(true)}>
        <Send className="size-4" /> Enviar a grupos
      </Button>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" /> Nuevo grupo
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="WhatsApp · Audiencia"
          title="Grupos"
          description="Gestiona tus grupos de difusión."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

      <QueryBoundary
        query={groups}
        skeleton={<TableSkeleton rows={6} cols={4} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Users,
          title: "Sin grupos todavía",
          description:
            "Conecta WhatsApp y sincroniza tus grupos, o crea uno para difundir mensajes a tu audiencia.",
          action: (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Nuevo grupo
            </Button>
          ),
        }}
      >
        {(data) => (
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-faint">
                  {COLUMNS.map((c, i) => (
                    <th key={i} className="px-4 py-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-line last:border-0 hover:bg-panel-raised/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{g.name}</div>
                      {g.remoteJid ? (
                        <div className="truncate text-[11px] text-ink-faint">{g.remoteJid}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{g.members}</td>
                    <td className="px-4 py-3">
                      {g.synced ? (
                        <Badge variant="success">Sincronizado</Badge>
                      ) : (
                        <Badge variant="neutral">Manual</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => setVarsGroup(g)}
                          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                          title="Variables"
                        >
                          <Settings2 className="size-4" /> Variables
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </QueryBoundary>

      <GroupCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <GroupVarsDialog
        open={varsGroup !== null}
        onOpenChange={(v) => {
          if (!v) setVarsGroup(null);
        }}
        group={varsGroup}
      />
      <CampaignFormDialog open={campaignOpen} onOpenChange={setCampaignOpen} campaign={null} />
    </div>
  );
}
