import {
  Clapperboard,
  Code2,
  Dumbbell,
  HeartPulse,
  Megaphone,
  Palette,
  PenTool,
  Plane,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceKind } from "@nv/domain";

/** Category metadata for workspace creation: label, description, accent, icon. */
export const KIND_META: Record<
  WorkspaceKind,
  { label: string; desc: string; accent: string; icon: LucideIcon }
> = {
  creative: {
    label: "Creativo",
    desc: "Agencia o estudio creativo",
    accent: "#5B8DEF",
    icon: Palette,
  },
  software: {
    label: "Software",
    desc: "Producto o estudio de software",
    accent: "#7C7CF0",
    icon: Code2,
  },
  health: {
    label: "Salud",
    desc: "Clínica, salud o bienestar",
    accent: "#3FB950",
    icon: HeartPulse,
  },
  design: {
    label: "Diseño",
    desc: "Diseño gráfico y de producto",
    accent: "#E1306C",
    icon: PenTool,
  },
  tourism: {
    label: "Turismo",
    desc: "Viajes, turismo y hospedaje",
    accent: "#229ED9",
    icon: Plane,
  },
  ecommerce: {
    label: "E-commerce",
    desc: "Tienda online y ventas",
    accent: "#E3B341",
    icon: ShoppingBag,
  },
  marketing: {
    label: "Marketing",
    desc: "Agencia o equipo de marketing",
    accent: "#F85149",
    icon: Megaphone,
  },
  ai: { label: "IA", desc: "Producto o servicio de IA", accent: "#7C7CF0", icon: Sparkles },
  fitness: {
    label: "Fitness",
    desc: "Gimnasio, coaching y fitness",
    accent: "#3FB950",
    icon: Dumbbell,
  },
  security: {
    label: "Seguridad",
    desc: "Seguridad y vigilancia",
    accent: "#F85149",
    icon: ShieldCheck,
  },
  streaming: { label: "Streaming", desc: "Streaming y creadores", accent: "#E1306C", icon: Radio },
  media: {
    label: "Media",
    desc: "Medios, prensa y contenido",
    accent: "#5B8DEF",
    icon: Clapperboard,
  },
};

export const WORKSPACE_ACCENTS = [
  "#5B8DEF",
  "#7C7CF0",
  "#3FB950",
  "#E3B341",
  "#F85149",
  "#E1306C",
  "#229ED9",
];
