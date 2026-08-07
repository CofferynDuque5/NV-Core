/**
 * Product changelog ("Novedades"). Curated release notes shipped with the app
 * (like the help center), not user data — served from config and rendered
 * client-side. Entries are ordered newest-first. The per-user "unseen" badge is
 * computed by comparing each entry's date against the user's last-seen time.
 */

export type ChangelogType = "feature" | "improvement" | "fix";

export interface ChangelogEntry {
  /** Stable identifier. */
  id: string;
  /** ISO date (YYYY-MM-DD) the change shipped. */
  date: string;
  title: string;
  type: ChangelogType;
  summary: string;
  highlights: string[];
}

/** Newest first. Keep entries truthful to what actually shipped. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: "help-center-and-whats-new",
    date: "2026-08-07",
    title: "Centro de ayuda y Novedades",
    type: "feature",
    summary: "Encuentra respuestas sin salir del producto y mantente al día de cada mejora.",
    highlights: [
      "Nuevo Centro de ayuda con guías buscables por tema y categoría.",
      "Panel de Novedades con el registro de cambios del producto.",
      "Indicador de novedades sin leer en la barra superior.",
    ],
  },
  {
    id: "guided-onboarding",
    date: "2026-08-07",
    title: "Onboarding guiado",
    type: "feature",
    summary: "Una guía de primeros pasos que te lleva hasta tu primer post publicado.",
    highlights: [
      "Checklist en el Dashboard con progreso real, no simulado.",
      "Cada paso se completa solo al realizar la acción (conectar, audiencia, contenido, publicar).",
      "Puedes ocultarla cuando quieras; recordamos tu elección.",
    ],
  },
  {
    id: "contacts-csv-import-export",
    date: "2026-08-06",
    title: "Importa y exporta contactos por CSV",
    type: "feature",
    summary: "Migra tu base de contactos en minutos y llévala contigo cuando quieras.",
    highlights: [
      "Importación con detección de duplicados por email y resumen por fila.",
      "Cabeceras en español o inglés y etiquetas flexibles.",
      "Exportación de toda tu base a un CSV con un clic.",
    ],
  },
  {
    id: "analytics-sql-and-scale",
    date: "2026-08-05",
    title: "Analytics más rápido y a escala",
    type: "improvement",
    summary: "Métricas calculadas en la base de datos, listas incluso con cientos de miles de filas.",
    highlights: [
      "KPIs, series diarias y mapa de calor con agregación SQL.",
      "Consultas acotadas e índices para respuestas por debajo de 300 ms.",
      "Búsqueda de contactos autoritativa sobre toda la tabla del workspace.",
    ],
  },
  {
    id: "real-messaging-integrations",
    date: "2026-08-04",
    title: "Integraciones de mensajería reales",
    type: "improvement",
    summary: "Envíos más fiables con manejo de errores y reintentos automáticos.",
    highlights: [
      "Clasificación de errores de WhatsApp y Meta (auth, límite de tasa, medios…).",
      "Reintentos con espera progresiva ante fallos temporales.",
      "Verificación de firma en los webhooks entrantes.",
    ],
  },
  {
    id: "crm-kanban-and-notes",
    date: "2026-08-03",
    title: "CRM con pipeline Kanban y notas",
    type: "feature",
    summary: "Gestiona tu audiencia como un pipeline y registra el contexto de cada contacto.",
    highlights: [
      "Vista Kanban para mover contactos entre etapas arrastrando.",
      "Notas por contacto con autor y fecha.",
      "Filtros por etapa y búsqueda.",
    ],
  },
  {
    id: "unified-inbox",
    date: "2026-08-02",
    title: "Inbox unificado",
    type: "feature",
    summary: "Todas tus conversaciones en un solo lugar, organizadas y asignables.",
    highlights: [
      "Filtros por canal, estado y responsable.",
      "Asignación de conversaciones a miembros del equipo.",
      "Etiquetas para priorizar y organizar.",
    ],
  },
  {
    id: "marketplace",
    date: "2026-08-01",
    title: "Marketplace de apps",
    type: "feature",
    summary: "Amplía NV Core instalando apps por workspace desde un catálogo curado.",
    highlights: [
      "Catálogo con categorías y buscador.",
      "Instala y desinstala por workspace.",
      "Estado de instalación siempre visible.",
    ],
  },
];

/** The date of the most recent entry (ISO string), or null if there are none. */
export function latestChangelogDate(): string | null {
  return CHANGELOG_ENTRIES.reduce<string | null>(
    (max, e) => (max === null || e.date > max ? e.date : max),
    null,
  );
}
