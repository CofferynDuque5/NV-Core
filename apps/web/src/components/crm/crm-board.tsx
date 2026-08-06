import * as React from "react";
import type { Contact, ContactStage } from "@nv/domain";

import { cn } from "@/lib/utils";
import { groupByStage } from "@/lib/crm";
import { Badge } from "@/components/ui/badge";

/**
 * CRM pipeline (kanban). Cards are dragged between stage columns via native
 * HTML5 drag-and-drop (no new deps); dropping moves the contact to that stage.
 */
export function CrmBoard({
  contacts,
  onOpen,
  onMove,
}: {
  contacts: Contact[];
  onOpen: (c: Contact) => void;
  onMove: (id: string, stage: ContactStage) => void;
}) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<ContactStage | null>(null);
  const columns = groupByStage(contacts);

  function drop(stage: ContactStage) {
    if (dragId) {
      const c = contacts.find((x) => x.id === dragId);
      if (c && c.stage !== stage) onMove(dragId, stage);
    }
    setDragId(null);
    setOverStage(null);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => (
        <div
          key={col.stage}
          onDragOver={(e) => {
            e.preventDefault();
            if (overStage !== col.stage) setOverStage(col.stage);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((s) => (s === col.stage ? null : s));
          }}
          onDrop={() => drop(col.stage)}
          className={cn(
            "flex max-h-[70vh] flex-col rounded-xl border bg-panel-sunken/60 transition-colors",
            overStage === col.stage ? "border-brand/60 bg-brand/5" : "border-line",
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="size-2.5 rounded-full" style={{ background: col.accent }} />
            <span className="text-sm font-semibold text-ink">{col.stage}</span>
            <span className="ml-auto rounded-full bg-panel-high px-2 py-0.5 text-[11px] text-ink-muted">
              {col.items.length}
            </span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {col.items.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-ink-faint">Arrastra contactos aquí</p>
            ) : (
              col.items.map((c) => (
                <button
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onClick={() => onOpen(c)}
                  className={cn(
                    "block w-full cursor-grab rounded-lg border border-line-soft bg-panel p-2.5 text-left transition-shadow hover:border-line-bright active:cursor-grabbing",
                    dragId === c.id && "opacity-50",
                  )}
                >
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  {c.company ? <p className="truncate text-[11px] text-ink-faint">{c.company}</p> : null}
                  {c.tags.length > 0 ? (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="neutral">{t}</Badge>
                      ))}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
