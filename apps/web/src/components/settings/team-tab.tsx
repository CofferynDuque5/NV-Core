
import * as React from "react";
import { ROLES, type Role } from "@nv/domain";
import { Loader2, MailCheck, Trash2, UserPlus, Users, X } from "lucide-react";

import { useTeam, useTeamInvitations } from "@/hooks/use-domain-data";
import { useAddMember, useRemoveMember, useRevokeInvitation } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { InviteMemberDialog } from "@/components/entities/invite-member-dialog";

export function TeamTab() {
  const team = useTeam();
  const ws = useWorkspace();
  const memberships = useAuthStore((s) => s.memberships);
  const currentUser = useAuthStore((s) => s.user);
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const revokeInvitation = useRevokeInvitation();
  const confirm = useConfirm();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const myRole = memberships.find((m) => m.workspaceSlug === ws.slug)?.role;
  const canManage = myRole === "Owner" || myRole === "Admin";
  const members = team.data ?? [];
  const invitationsQuery = useTeamInvitations();
  const invitations = canManage ? (invitationsQuery.data ?? []) : [];

  function changeRole(email: string, role: Role, memberId: string) {
    setBusyId(memberId);
    addMember.mutate({ email, role }, { onSettled: () => setBusyId(null) });
  }

  async function remove(memberId: string, name: string) {
    const ok = await confirm({
      title: "Quitar miembro",
      description: `¿Quitar a ${name} de este workspace?`,
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(memberId);
    removeMember.mutate(memberId, { onSettled: () => setBusyId(null) });
  }

  return (
    <div className="space-y-4">
    <Panel>
      <PanelHeader
        title="Equipo"
        description={canManage ? undefined : "Solo Owner/Admin pueden gestionar el equipo."}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invitar
            </Button>
          ) : undefined
        }
      />
      <div className="p-4">
        {team.isLoading ? (
          <ListSkeleton rows={3} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aún no hay miembros"
            description="Invita a tu equipo para colaborar en campañas, contenido y automatizaciones."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="size-4" /> Invitar miembro
                </Button>
              ) : undefined
            }
            compact
          />
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const isSelf = currentUser?.email === m.email;
              return (
                <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                    style={{ background: m.avatarColor }}
                  >
                    {m.name
                      .split(" ")
                      .map((w) => w[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {m.name}
                      {isSelf ? <span className="text-[10px] text-ink-faint">(tú)</span> : null}
                    </div>
                    <div className="truncate text-xs text-ink-muted">{m.email}</div>
                  </div>

                  {canManage ? (
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m.email, e.target.value as Role, m.id)}
                      className="h-8 rounded-lg border border-line-soft bg-panel-raised px-2 text-xs text-ink focus-visible:border-brand/60 focus-visible:outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full border border-line-strong bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted">
                      {m.role}
                    </span>
                  )}

                  {canManage ? (
                    <button
                      onClick={() => remove(m.id, m.name)}
                      disabled={busyId === m.id}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger disabled:opacity-50"
                      title="Quitar del workspace"
                    >
                      {busyId === m.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Panel>

      {canManage && invitations.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Invitaciones pendientes"
            description="Personas invitadas que aún no se han registrado. Entrarán al crear su cuenta con ese correo."
          />
          <ul className="divide-y divide-line p-4">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                  <MailCheck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{inv.email}</div>
                  <div className="text-xs text-ink-muted">
                    Invitado como {inv.role}
                    {inv.invitedByName ? ` · por ${inv.invitedByName}` : ""}
                  </div>
                </div>
                <span className="rounded-full border border-line-strong bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted">
                  Pendiente
                </span>
                <button
                  onClick={() => revokeInvitation.mutate(inv.id)}
                  disabled={revokeInvitation.isPending}
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger disabled:opacity-50"
                  title="Cancelar invitación"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
