
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { MODULE_META, NAV_SECTIONS } from "@nv/domain";
import { CornerDownLeft, Megaphone, Search, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCommandStore } from "@/stores/command-store";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useWorkspace } from "@/hooks/use-workspace";
import { useCampaigns, useContacts, useGroups } from "@/hooks/use-domain-data";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getNavIcon } from "./sidebar-icon";

/** Lowercase without accents, so "campana" finds "Campañas". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Every word of the search appears somewhere in the item. */
export function matches(value: string, search: string): boolean {
  const hay = fold(value);
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

const groupCls =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-faint";
const itemCls = cn(
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft",
  "data-[selected=true]:bg-panel-raised data-[selected=true]:text-ink",
);

export function CommandPalette() {
  const { open, setOpen, query, setQuery } = useCommandStore();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const openPalette = React.useCallback(() => setOpen(true), [setOpen]);

  useKeyboardShortcut("k", openPalette, { meta: true });

  // Records of this brand, searched once there are 2+ letters.
  const term = query.trim();
  const searching = open && term.length >= 2;
  const contacts = useContacts({ q: term, pageSize: 6 }, { enabled: searching });
  const campaigns = useCampaigns({ enabled: open });
  const groups = useGroups({ enabled: open });
  const contactHits = searching ? (contacts.data?.items ?? []).slice(0, 6) : [];
  const campaignHits = searching ? (campaigns.data?.items ?? []).filter((c) => matches(c.name, term)).slice(0, 5) : [];
  const groupHits = searching ? (groups.data?.items ?? []).filter((g) => matches(g.name, term)).slice(0, 5) : [];

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
        module: "tienda",
        label: "Tienda",
        section: "PRINCIPAL",
        icon: "ShoppingBag",
        description: "Catálogo de productos, descripciones y precios",
      },
      {
        module: "perfil",
        label: "Mi perfil",
        section: "SISTEMA",
        icon: "Settings",
        description: "Tu nombre, contraseña y preferencias",
      },
      {
        module: "cobros",
        label: "Cobros",
        section: "PRINCIPAL",
        icon: "BadgeDollarSign",
        description: "Métodos de cobro y pagos por verificar",
      },
      {
        module: "informes",
        label: "Informe semanal",
        section: "AUTOMATIZACIÓN",
        icon: "FileBarChart",
        description: "Resumen de la semana y lo que necesita atención",
      },
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

  function go(path: string) {
    navigate(`/w/${ws.slug}/${path}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="max-w-xl gap-0 overflow-hidden p-0">
        <Command
          className="flex flex-col"
          filter={(value, search) => (matches(value, search) ? 1 : 0)}
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
            {contactHits.length > 0 ? (
              <Command.Group heading="Contactos" className={groupCls}>
                {contactHits.map((c) => (
                  <Command.Item
                    key={`contact-${c.id}`}
                    value={`contacto ${c.id} ${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${term}`}
                    onSelect={() => go(`contactos?q=${encodeURIComponent(c.name)}`)}
                    className={itemCls}
                  >
                    <User className="size-4 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="truncate text-[11px] text-ink-faint">{c.phone ?? c.email ?? c.stage}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {campaignHits.length > 0 ? (
              <Command.Group heading="Campañas" className={groupCls}>
                {campaignHits.map((c) => (
                  <Command.Item key={`campaign-${c.id}`} value={`campana ${c.id} ${c.name}`} onSelect={() => go("campanas")} className={itemCls}>
                    <Megaphone className="size-4 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-ink-faint">{c.status}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {groupHits.length > 0 ? (
              <Command.Group heading="Grupos" className={groupCls}>
                {groupHits.map((g) => (
                  <Command.Item key={`group-${g.id}`} value={`grupo ${g.id} ${g.name}`} onSelect={() => go("grupos")} className={itemCls}>
                    <Users className="size-4 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            <Command.Group heading="Navegación" className={groupCls}>
              {items.map((item) => {
                const Icon = getNavIcon(item.icon);
                return (
                  <Command.Item
                    key={item.module}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => go(item.module)}
                    className={itemCls}
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
