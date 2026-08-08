import type { ModuleId } from "../enums";

export interface NavItem {
  module: ModuleId;
  label: string;
  /** lucide-react icon name. */
  icon: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Sidebar navigation, grouped exactly as the NV Core design.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "PRINCIPAL",
    items: [
      { module: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { module: "calendario", label: "Calendario", icon: "Calendar" },
      { module: "campanas", label: "Campañas", icon: "Megaphone" },
    ],
  },
  {
    label: "AUDIENCIA",
    items: [
      { module: "contactos", label: "Contactos", icon: "Contact" },
      { module: "grupos", label: "Grupos", icon: "Users" },
      { module: "segmentos", label: "Segmentos", icon: "Filter" },
      { module: "formularios", label: "Formularios", icon: "ClipboardList" },
      { module: "embudos", label: "Embudos", icon: "Filter" },
      { module: "secuencias", label: "Secuencias", icon: "Send" },
    ],
  },
  {
    label: "MENSAJERÍA",
    items: [{ module: "inbox", label: "Inbox", icon: "Inbox" }],
  },
  {
    label: "CREACIÓN",
    items: [
      { module: "builder", label: "Campaign Builder", icon: "Layers" },
      { module: "ai", label: "AI Content Studio", icon: "Sparkles" },
      { module: "plantillas", label: "Plantillas", icon: "FileText" },
      { module: "biblioteca", label: "Biblioteca", icon: "Image" },
    ],
  },
  {
    label: "AUTOMATIZACIÓN",
    items: [
      { module: "automatizaciones", label: "Automatizaciones", icon: "Workflow" },
      { module: "analytics", label: "Analytics", icon: "BarChart3" },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { module: "marketplace", label: "Integraciones", icon: "Store" },
      { module: "conexiones", label: "Conexiones", icon: "Plug" },
      { module: "configuracion", label: "Configuración", icon: "Settings" },
    ],
  },
];

/** Human labels + descriptions for each module (used in headers, palette). */
export const MODULE_META: Record<ModuleId, { label: string; description: string }> = {
  dashboard: { label: "Dashboard", description: "Resumen operativo del workspace" },
  calendario: { label: "Calendario", description: "Planificación de publicaciones" },
  campanas: { label: "Campañas", description: "Operaciones de marketing" },
  contactos: { label: "Contactos", description: "CRM y audiencia" },
  grupos: { label: "Grupos", description: "Grupos de difusión" },
  segmentos: { label: "Segmentos", description: "Audiencias dinámicas" },
  formularios: { label: "Formularios", description: "Captura de leads (opt-in)" },
  embudos: { label: "Embudos", description: "Funnels multipaso" },
  secuencias: { label: "Secuencias", description: "Autoresponders (drip)" },
  inbox: { label: "Inbox", description: "Conversaciones unificadas" },
  builder: { label: "Campaign Builder", description: "Editor visual de contenido" },
  ai: { label: "AI Content Studio", description: "Generación de contenido con IA" },
  plantillas: { label: "Plantillas", description: "Mensajes reutilizables" },
  biblioteca: { label: "Biblioteca", description: "Gestor de medios" },
  automatizaciones: { label: "Automatizaciones", description: "Flujos sin código" },
  analytics: { label: "Analytics", description: "Business Intelligence" },
  marketplace: { label: "Integraciones", description: "Conecta tus herramientas" },
  conexiones: { label: "Conexiones", description: "Proveedores & OAuth" },
  configuracion: { label: "Configuración", description: "Equipo, roles y sistema" },
};
