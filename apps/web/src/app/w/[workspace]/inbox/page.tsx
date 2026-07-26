"use client";

import * as React from "react";
import { CHANNELS } from "@nv/domain";
import { CheckCircle2, Inbox, MessageSquare, Plus, RotateCcw, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConversations, useMessages } from "@/hooks/use-domain-data";
import { useResolveConversation, useSendMessage } from "@/hooks/use-domain-mutations";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChannelChip } from "@/components/common/channel-badge";
import { ConversationCreateDialog } from "@/components/entities/conversation-create-dialog";

export default function InboxPage() {
  const conversations = useConversations();
  const items = conversations.data?.items ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const messages = useMessages(selected);
  const send = useSendMessage(selected);
  const resolve = useResolveConversation();

  const active = items.find((c) => c.id === selected) ?? null;

  function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    send.mutate(draft.trim(), { onSuccess: () => setDraft("") });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversaciones unificadas"
        title="Inbox"
        description="Todas tus conversaciones de WhatsApp, Instagram, Telegram y más, en un solo lugar."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Nueva conversación
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Conversation list */}
        <Panel className="flex max-h-[70vh] flex-col overflow-hidden">
          <PanelHeader title="Conversaciones" />
          <div className="flex-1 overflow-y-auto p-3">
            {conversations.isLoading ? (
              <ListSkeleton rows={5} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Bandeja vacía"
                description="Crea una conversación o conecta un canal para recibir mensajes."
                compact
              />
            ) : (
              <ul className="space-y-1">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selected === c.id ? "bg-brand/12" : "hover:bg-panel-raised",
                      )}
                    >
                      <ChannelChip id={c.channel} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {c.contactName}
                        </span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {CHANNELS[c.channel].name}
                        </span>
                      </span>
                      {c.resolved ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-state-success" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Thread */}
        <Panel className="flex min-h-[70vh] flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Selecciona una conversación"
                description="Aquí verás el hilo completo y podrás responder o resolver."
              />
            </div>
          ) : (
            <>
              <PanelHeader
                title={active.contactName}
                description={CHANNELS[active.channel].name}
                action={
                  <Button
                    variant={active.resolved ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => resolve.mutate({ id: active.id, resolved: !active.resolved })}
                  >
                    {active.resolved ? (
                      <>
                        <RotateCcw className="size-4" /> Reabrir
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4" /> Resolver
                      </>
                    )}
                  </Button>
                }
              />

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {messages.isLoading ? (
                  <ListSkeleton rows={3} />
                ) : (messages.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">
                    No hay mensajes todavía. Escribe el primero.
                  </p>
                ) : (
                  (messages.data ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.direction === "out" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          m.direction === "out"
                            ? "bg-brand text-white"
                            : "bg-panel-raised text-ink",
                        )}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={submitMessage} className="flex items-center gap-2 border-t border-line p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe una respuesta…"
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={send.isPending || !draft.trim()}>
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </Panel>
      </div>

      <ConversationCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => setSelected(id)}
      />
    </div>
  );
}
