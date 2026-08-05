import * as React from "react";
import { CHANNELS, CHANNEL_IDS } from "@nv/domain";
import { CheckCircle2, Inbox, MessageSquare, Plus, RotateCcw, Search, Send, Tag, UserRound, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  UNASSIGNED,
  filterConversations,
  openCount,
  withLabel,
  withoutLabel,
  type InboxStatus,
} from "@/lib/inbox";
import { useConversations, useMessages, useTeam } from "@/hooks/use-domain-data";
import { useResolveConversation, useSendMessage, useUpdateConversation } from "@/hooks/use-domain-mutations";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChannelChip } from "@/components/common/channel-badge";
import { ConversationCreateDialog } from "@/components/entities/conversation-create-dialog";

const selectClass =
  "h-9 rounded-lg border border-line-soft bg-panel px-2 text-xs text-ink focus-visible:border-brand/60 focus-visible:outline-none";

function initialsOf(s: string): string {
  return s.split(/[@\s.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

const STATUSES: { v: InboxStatus; label: string }[] = [
  { v: "open", label: "Abiertas" },
  { v: "resolved", label: "Resueltas" },
  { v: "all", label: "Todas" },
];

export default function InboxPage() {
  const conversations = useConversations();
  const team = useTeam();
  const all = conversations.data?.items ?? [];

  const [selected, setSelected] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [labelDraft, setLabelDraft] = React.useState("");

  // Filters
  const [q, setQ] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [status, setStatus] = React.useState<InboxStatus>("open");
  const [assignee, setAssignee] = React.useState("");

  const messages = useMessages(selected);
  const send = useSendMessage(selected);
  const resolve = useResolveConversation();
  const updateConv = useUpdateConversation();

  const members = team.data ?? [];
  const nameByEmail = React.useMemo(
    () => Object.fromEntries(members.map((m) => [m.email, m.name])),
    [members],
  );
  const filtered = filterConversations(all, { q, channel, status, assignee });
  const active = all.find((c) => c.id === selected) ?? null;

  function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    send.mutate(draft.trim(), { onSuccess: () => setDraft("") });
  }

  function addLabel() {
    if (!active || !labelDraft.trim()) return;
    updateConv.mutate({ id: active.id, input: { labels: withLabel(active.labels, labelDraft) } });
    setLabelDraft("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversaciones unificadas"
        title="Inbox"
        description="Todas tus conversaciones de WhatsApp, Instagram, Telegram y más, con asignación y etiquetas."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Nueva conversación
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Conversation list + filters */}
        <Panel className="flex max-h-[74vh] flex-col overflow-hidden">
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o etiqueta…" className="pl-9" aria-label="Buscar conversaciones" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.v}
                  onClick={() => setStatus(s.v)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    status === s.v ? "bg-brand/15 text-ink-bright" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-ink-faint">{openCount(all)} abiertas</span>
            </div>
            <div className="flex gap-1.5">
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={cn(selectClass, "flex-1")} aria-label="Filtrar por canal">
                <option value="">Todos los canales</option>
                {CHANNEL_IDS.map((c) => (
                  <option key={c} value={c}>{CHANNELS[c].name}</option>
                ))}
              </select>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cn(selectClass, "flex-1")} aria-label="Filtrar por responsable">
                <option value="">Cualquier responsable</option>
                <option value={UNASSIGNED}>Sin asignar</option>
                {members.map((m) => (
                  <option key={m.email} value={m.email}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {conversations.isLoading ? (
              <ListSkeleton rows={5} />
            ) : all.length === 0 ? (
              <EmptyState icon={Inbox} title="Bandeja vacía" description="Crea una conversación o conecta un canal para recibir mensajes." compact />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-faint">Ninguna conversación coincide con los filtros.</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selected === c.id ? "bg-brand/12" : "hover:bg-panel-raised",
                      )}
                    >
                      <ChannelChip id={c.channel} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.contactName}</span>
                          {c.resolved ? <CheckCircle2 className="size-3.5 shrink-0 text-state-success" /> : null}
                        </span>
                        {(c.labels ?? []).length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {(c.labels ?? []).map((l) => (
                              <span key={l} className="rounded bg-panel-high px-1.5 py-0.5 text-[10px] text-ink-muted">{l}</span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      {c.assignee ? (
                        <span
                          title={nameByEmail[c.assignee] ?? c.assignee}
                          className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/20 text-[10px] font-bold text-brand"
                        >
                          {initialsOf(nameByEmail[c.assignee] ?? c.assignee)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Thread */}
        <Panel className="flex min-h-[74vh] flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessageSquare} title="Selecciona una conversación" description="Aquí verás el hilo completo y podrás responder, asignar o etiquetar." />
            </div>
          ) : (
            <>
              <PanelHeader
                title={active.contactName}
                description={CHANNELS[active.channel].name}
                action={
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-ink-faint">
                      <UserRound className="size-3.5" />
                      <select
                        value={active.assignee ?? ""}
                        onChange={(e) => updateConv.mutate({ id: active.id, input: { assignee: e.target.value } })}
                        className={selectClass}
                        aria-label="Asignar responsable"
                      >
                        <option value="">Sin asignar</option>
                        {members.map((m) => (
                          <option key={m.email} value={m.email}>{m.name}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant={active.resolved ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => resolve.mutate({ id: active.id, resolved: !active.resolved })}
                    >
                      {active.resolved ? (<><RotateCcw className="size-4" /> Reabrir</>) : (<><CheckCircle2 className="size-4" /> Resolver</>)}
                    </Button>
                  </div>
                }
              />

              {/* Labels bar */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
                <Tag className="size-3.5 text-ink-faint" />
                {(active.labels ?? []).map((l) => (
                  <span key={l} className="inline-flex items-center gap-1 rounded-full bg-panel-high px-2 py-0.5 text-[11px] text-ink">
                    {l}
                    <button
                      onClick={() => updateConv.mutate({ id: active.id, input: { labels: withoutLabel(active.labels, l) } })}
                      className="text-ink-faint hover:text-state-danger"
                      aria-label={`Quitar etiqueta ${l}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
                  placeholder="Añadir etiqueta…"
                  className="h-6 w-28 rounded-md border border-dashed border-line-soft bg-transparent px-2 text-[11px] text-ink placeholder:text-ink-faint focus:outline-none"
                  aria-label="Añadir etiqueta"
                />
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {messages.isLoading ? (
                  <ListSkeleton rows={3} />
                ) : (messages.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">No hay mensajes todavía. Escribe el primero.</p>
                ) : (
                  (messages.data ?? []).map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", m.direction === "out" ? "bg-brand text-white" : "bg-panel-raised text-ink")}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={submitMessage} className="flex items-center gap-2 border-t border-line p-3">
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe una respuesta…" className="flex-1" />
                <Button type="submit" size="icon" disabled={send.isPending || !draft.trim()}>
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </Panel>
      </div>

      <ConversationCreateDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(id) => setSelected(id)} />
    </div>
  );
}
