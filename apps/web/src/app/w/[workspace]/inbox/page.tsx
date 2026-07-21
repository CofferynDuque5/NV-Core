"use client";

import { Inbox, MessageSquare } from "lucide-react";

import { useConversations } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";

export default function InboxPage() {
  const conversations = useConversations();
  const items = conversations.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversaciones unificadas"
        title="Inbox"
        description="Todas tus conversaciones de WhatsApp, Instagram, Telegram y más, en un solo lugar."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Conversation list */}
        <Panel className="flex max-h-[70vh] flex-col overflow-hidden">
          <PanelHeader title="Todas las conversaciones" />
          <div className="border-b border-line p-3">
            <Input placeholder="Buscar…" className="h-8" />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {conversations.isLoading ? (
              <ListSkeleton rows={5} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Bandeja vacía"
                description="Conecta un canal para recibir mensajes aquí."
                compact
              />
            ) : null}
          </div>
        </Panel>

        {/* Thread */}
        <Panel className="flex min-h-[70vh] items-center justify-center">
          <EmptyState
            icon={MessageSquare}
            title="Selecciona una conversación"
            description="Aquí verás el hilo completo y podrás responder, asignar o resolver."
          />
        </Panel>
      </div>
    </div>
  );
}
