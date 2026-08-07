import {
  Activity,
  BarChart3,
  Calendar,
  Contact,
  FileText,
  Filter,
  History,
  Image,
  Inbox,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Plug,
  Settings,
  Sparkles,
  Store,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  Activity,
  LayoutDashboard,
  Calendar,
  Megaphone,
  Contact,
  Users,
  Filter,
  History,
  Inbox,
  Layers,
  Sparkles,
  FileText,
  Image,
  Workflow,
  BarChart3,
  Store,
  Plug,
  Settings,
  LifeBuoy,
};

export function getNavIcon(name: string): LucideIcon {
  return MAP[name] ?? LayoutDashboard;
}

/** Nav item shape rendered by the shell (superset of the domain NavItem). */
export interface NavRenderItem {
  module: string;
  label: string;
  icon: string;
}

/**
 * Web-only nav entries injected into a section by its label. Kept here (not in
 * @nv/domain) so pages without a domain module can still appear in the sidebar.
 */
export const EXTRA_NAV_ITEMS: Record<string, NavRenderItem[]> = {
  PRINCIPAL: [{ module: "historial", label: "Historial", icon: "History" }],
  SISTEMA: [
    { module: "ayuda", label: "Centro de ayuda", icon: "LifeBuoy" },
    { module: "estado", label: "Estado del servicio", icon: "Activity" },
  ],
};
