
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { MODULE_META, NAV_SECTIONS } from "@nv/domain";
import { CornerDownLeft, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCommandStore } from "@/stores/command-store";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useWorkspace } from "@/hooks/use-workspace";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getNavIcon } from "./sidebar-icon";

export function CommandPalette() {
  const { open, setOpen, query, setQuery } = useCommandStore();
  const navigate = useNavigate();
  const ws = useWorkspace();

  useKeyboardShortcut("k", () => setOpen(true), { meta: true });

  const items = React.useMemo(
    () => [
      ...NAV_SECTIONS.flatMap((s) =>
        s.items.map((it) => ({
          module: it.module,
          label: it.label,
          section: s.label,
          icon: it.icon,
          description: MODULE_META[it.module].description,
        })),
      ),
      // Web-only destinations without a domain module (see EXTRA_NAV_ITEMS).
      {
        module: "ayuda",
        label: "Centro de ayuda",
        section: "SISTEMA",
        icon: "LifeBuoy",
        description: "Guías y respuestas",
      },
      {
        module: "novedades",
        label: "Novedades",
        section: "SISTEMA",
        icon: "Sparkles",
        description: "Registro de cambios del producto",
      },
      {
        module: "estado",
        label: "Estado del servicio",
        section: "SISTEMA",
        icon: "Activity",
        description: "Salud de la plataforma",
      },
    ],
    [],
  );

  function go(module: string) {
    navigate(`/w/${ws.slug}/${module}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="max-w-xl gap-0 overflow-hidden p-0">
        <Command
          className="flex flex-col"
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 text-ink-faint" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar o ejecutar…"
              className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            <kbd className="rounded border border-line-strong bg-panel-raised px-1.5 py-0.5 text-[10px] text-ink-muted">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-ink-muted">
              Sin resultados para “{query}”.
            </Command.Empty>
            <Command.Group
              heading="Navegación"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-faint"
            >
              {items.map((item) => {
                const Icon = getNavIcon(item.icon);
                return (
                  <Command.Item
                    key={item.module}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => go(item.module)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft",
                      "data-[selected=true]:bg-panel-raised data-[selected=true]:text-ink",
                    )}
                  >
                    <Icon className="size-4 text-ink-muted" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[11px] text-ink-faint">{item.section}</span>
                    <CornerDownLeft className="size-3 text-ink-faint opacity-0 data-[selected=true]:opacity-100" />
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
