import type { MarketplaceApp } from "../entities";

/**
 * Curated Marketplace app catalog. These are installable add-ons scoped per
 * workspace (distinct from the env-configured Integraciones/Conexiones): a
 * workspace turns them on/off and the choice is persisted.
 */
export const MARKETPLACE_APPS: MarketplaceApp[] = [
  {
    id: "surveys",
    name: "Encuestas & NPS",
    category: "Engagement",
    tagline: "Mide la satisfacción de tus clientes.",
    description:
      "Lanza encuestas y NPS por WhatsApp o email tras cada interacción y visualiza la satisfacción en el tiempo.",
    features: ["Plantillas de NPS/CSAT", "Envío automático post-venta", "Panel de resultados"],
    hue: 210,
  },
  {
    id: "reviews",
    name: "Reseñas & Reputación",
    category: "Engagement",
    tagline: "Consigue más reseñas de 5 estrellas.",
    description:
      "Solicita reseñas en Google y redes a tus clientes satisfechos y centraliza las respuestas.",
    features: ["Solicitud automática", "Enlaces a Google/Meta", "Alertas de reseñas negativas"],
    hue: 45,
  },
  {
    id: "chatbot",
    name: "Chatbot IA",
    category: "Automatización",
    tagline: "Responde 24/7 con IA.",
    description:
      "Un asistente entrenado con tu negocio que responde preguntas frecuentes y cualifica leads en el Inbox.",
    features: ["Respuestas con IA", "Handoff a humano", "Cualificación de leads"],
    hue: 265,
  },
  {
    id: "landing",
    name: "Landing Pages",
    category: "Contenido",
    tagline: "Publica páginas de captación en minutos.",
    description:
      "Crea landing pages con formularios que alimentan tu CRM directamente, sin escribir código.",
    features: ["Editor visual", "Formularios → CRM", "Dominio propio"],
    hue: 160,
  },
  {
    id: "coupons",
    name: "Cupones & Promos",
    category: "Ventas",
    tagline: "Genera y controla códigos de descuento.",
    description:
      "Crea campañas de cupones únicos, controla su uso y mide la conversión de cada promoción.",
    features: ["Códigos únicos", "Límites de uso", "Reporte de canje"],
    hue: 8,
  },
  {
    id: "loyalty",
    name: "Programa de Lealtad",
    category: "Ventas",
    tagline: "Premia a tus clientes recurrentes.",
    description: "Sistema de puntos y recompensas para fidelizar a tu base de clientes.",
    features: ["Puntos por compra", "Niveles y recompensas", "Tarjeta digital"],
    hue: 320,
  },
  {
    id: "webforms",
    name: "Formularios Web",
    category: "Contenido",
    tagline: "Captura leads desde tu sitio.",
    description: "Formularios embebibles que crean contactos en tu CRM al instante.",
    features: ["Embed en tu web", "Anti-spam", "Mapeo a campos del CRM"],
    hue: 190,
  },
  {
    id: "reports",
    name: "Reportes Avanzados",
    category: "Analítica",
    tagline: "Informes ejecutivos automáticos.",
    description:
      "Reportes programados con tus KPIs clave, enviados por email a tu equipo cada semana.",
    features: ["Informes programados", "Exportación PDF", "Comparativas por período"],
    hue: 230,
  },
  {
    id: "webhooks",
    name: "Webhooks & API",
    category: "Automatización",
    tagline: "Conecta NV Core con cualquier sistema.",
    description:
      "Envía eventos de NV Core (mensajes, campañas, ventas) a tus sistemas mediante webhooks salientes.",
    features: ["Eventos salientes", "Reintentos", "Firmas HMAC"],
    hue: 280,
  },
  {
    id: "calendar-sync",
    name: "Sincronización de Calendario",
    category: "Productividad",
    tagline: "Agenda citas desde el Inbox.",
    description: "Permite a tus clientes reservar citas que se sincronizan con tu calendario.",
    features: ["Reserva de citas", "Recordatorios", "Sincronización bidireccional"],
    hue: 130,
  },
];

export function getMarketplaceApp(id: string): MarketplaceApp | undefined {
  return MARKETPLACE_APPS.find((a) => a.id === id);
}
