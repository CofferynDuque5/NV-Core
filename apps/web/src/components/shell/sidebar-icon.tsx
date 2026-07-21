import {
  BarChart3,
  Calendar,
  Contact,
  FileText,
  Filter,
  Image,
  Inbox,
  Layers,
  LayoutDashboard,
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
  LayoutDashboard,
  Calendar,
  Megaphone,
  Contact,
  Users,
  Filter,
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
};

export function getNavIcon(name: string): LucideIcon {
  return MAP[name] ?? LayoutDashboard;
}
