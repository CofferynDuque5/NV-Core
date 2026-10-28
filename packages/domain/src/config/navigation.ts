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
      { module: "afiliados", label: "Afiliados", icon: "Handshake" },
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
  afiliados: { label: "Afiliados", description: "Programa de referidos" },
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

/**
 * Answers to «¿Qué quieres lograr primero?». Each goal pins the screens it
 * needs to the top of the sidebar (in this order) and sets the dashboard's
 * next steps. `modules` are route segments under /w/:workspace/.
 */
export const WORKSPACE_GOALS: {
  id: string;
  label: string;
  modules: string[];
  steps: { title: string; href: string; cta: string }[];
}[] = [
  {
    id: "difusion",
    label: "Difundir por WhatsApp / Telegram",
    modules: ["campanas", "grupos", "conexiones"],
    steps: [
      { title: "Conecta tu WhatsApp", href: "conexiones", cta: "Conectar" },
      { title: "Revisa las reglas de tus grupos y aparta los que no uses", href: "grupos", cta: "Ver grupos" },
      { title: "Crea tu primera campaña a grupos", href: "campanas", cta: "Nueva campaña" },
    ],
  },
  {
    id: "leads",
    label: "Captar clientes con formularios",
    modules: ["formularios", "embudos", "contactos"],
    steps: [
      { title: "Crea un formulario para captar datos", href: "formularios", cta: "Crear formulario" },
      { title: "Arma un embudo con tu oferta", href: "embudos", cta: "Crear embudo" },
      { title: "Revisa los contactos que llegan", href: "contactos", cta: "Ver contactos" },
    ],
  },
  {
    id: "ventas",
    label: "Vender y cobrar",
    modules: ["tienda", "cobros", "inbox"],
    steps: [
      { title: "Carga tus productos y precios en la Tienda", href: "tienda", cta: "Abrir Tienda" },
      { title: "Configura cómo te pagan (pago móvil, Binance, Zinli…)", href: "cobros", cta: "Configurar cobros" },
      { title: "Responde a tus clientes desde el Inbox", href: "inbox", cta: "Abrir Inbox" },
    ],
  },
  {
    id: "automatizar",
    label: "Automatizar seguimientos",
    modules: ["automatizaciones", "secuencias", "segmentos"],
    steps: [
      { title: "Activa una automatización de plantilla", href: "automatizaciones", cta: "Ver plantillas" },
      { title: "Crea una secuencia de seguimiento", href: "secuencias", cta: "Crear secuencia" },
      { title: "Agrupa a tus clientes en segmentos", href: "segmentos", cta: "Crear segmento" },
    ],
  },
  {
    id: "contenido",
    label: "Crear contenido con IA",
    modules: ["ai", "builder", "biblioteca"],
    steps: [
      { title: "Genera tu primer texto con IA", href: "ai", cta: "Abrir AI Studio" },
      { title: "Diseña una pieza en el editor", href: "builder", cta: "Abrir editor" },
      { title: "Sube tus fotos a la Biblioteca", href: "biblioteca", cta: "Subir" },
    ],
  },
  {
    id: "redes",
    label: "Publicar en redes sociales",
    modules: ["calendario", "conexiones", "analytics"],
    steps: [
      { title: "Conecta Instagram y Facebook", href: "conexiones", cta: "Conectar" },
      { title: "Programa tu primera publicación", href: "calendario", cta: "Abrir calendario" },
      { title: "Mira qué funciona en Analytics", href: "analytics", cta: "Ver Analytics" },
    ],
  },
];

export const WORKSPACE_GOAL_IDS = WORKSPACE_GOALS.map((g) => g.id);
