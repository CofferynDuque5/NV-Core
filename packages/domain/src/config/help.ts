/**
 * In-app Help Center content. This is curated product documentation shipped with
 * the app (like the navigation and workspace catalogs), not user data — so it is
 * served from config and rendered client-side. Keep articles accurate to the
 * actual product; every `moduleHref` deep-links to the module it describes.
 */

export type HelpCategoryId =
  | "primeros-pasos"
  | "canales"
  | "audiencia"
  | "contenido"
  | "automatizacion"
  | "cuenta";

export interface HelpCategory {
  id: HelpCategoryId;
  label: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
}

/** A structured content block — avoids shipping a Markdown parser dependency. */
export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "tip"; text: string };

export interface HelpArticle {
  slug: string;
  title: string;
  category: HelpCategoryId;
  summary: string;
  tags: string[];
  /** Module slug this article is about, for a "go to module" deep link. */
  moduleHref?: string;
  body: HelpBlock[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "primeros-pasos",
    label: "Primeros pasos",
    description: "Configura tu workspace y llega a tu primer post.",
    icon: "Rocket",
  },
  {
    id: "canales",
    label: "Canales y conexiones",
    description: "Conecta WhatsApp, Instagram y Facebook.",
    icon: "Plug",
  },
  {
    id: "audiencia",
    label: "Audiencia y CRM",
    description: "Contactos, grupos y segmentos.",
    icon: "Users",
  },
  {
    id: "contenido",
    label: "Contenido y campañas",
    description: "Crea, programa y publica de forma omnicanal.",
    icon: "Megaphone",
  },
  {
    id: "automatizacion",
    label: "Automatización y analítica",
    description: "Flujos sin código y métricas de rendimiento.",
    icon: "Workflow",
  },
  {
    id: "cuenta",
    label: "Cuenta y facturación",
    description: "Equipo, roles, planes y seguridad.",
    icon: "Settings",
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "bienvenido-a-nv-core",
    title: "Bienvenido a NV Core",
    category: "primeros-pasos",
    summary: "Qué es NV Core y cómo sacarle partido desde el primer día.",
    tags: ["introducción", "workspace", "empezar"],
    moduleHref: "dashboard",
    body: [
      {
        type: "p",
        text: "NV Core es una plataforma de marketing, CRM y automatización multi-workspace. Cada workspace es un espacio de trabajo independiente con sus propios contactos, campañas, conexiones y equipo.",
      },
      {
        type: "p",
        text: "El objetivo de tus primeros minutos es llegar a tu «primer valor»: publicar tu primer contenido. La guía de primeros pasos del Dashboard te lleva por ese camino de forma ordenada.",
      },
      {
        type: "steps",
        items: [
          "Conecta un canal (WhatsApp, Instagram o Facebook) en Conexiones.",
          "Crea tu audiencia importando contactos o creando un grupo.",
          "Diseña tu contenido con el editor visual o con la IA.",
          "Programa y publica tu primer post desde el Calendario.",
        ],
      },
      {
        type: "tip",
        text: "Cada tarjeta de la guía de primeros pasos se marca como completada automáticamente cuando realizas la acción real; no hay pasos ficticios.",
      },
    ],
  },
  {
    slug: "crear-y-cambiar-de-workspace",
    title: "Crear y cambiar de workspace",
    category: "primeros-pasos",
    summary: "Gestiona varios espacios de trabajo desde una sola cuenta.",
    tags: ["workspace", "multi-workspace", "cambiar"],
    moduleHref: "dashboard",
    body: [
      {
        type: "p",
        text: "Puedes tener varios workspaces —por ejemplo, uno por cliente o por marca— y cambiar entre ellos sin cerrar sesión.",
      },
      {
        type: "steps",
        items: [
          "Abre el selector de workspace en la parte superior de la barra lateral.",
          "Elige un workspace existente o crea uno nuevo con «Nuevo workspace».",
          "Quien crea un workspace se convierte automáticamente en su propietario (Owner).",
        ],
      },
      {
        type: "tip",
        text: "Los datos de cada workspace están completamente aislados: los contactos, campañas y conexiones de uno nunca se mezclan con los de otro.",
      },
    ],
  },
  {
    slug: "conectar-whatsapp",
    title: "Conecta WhatsApp",
    category: "canales",
    summary: "Vincula WhatsApp para enviar mensajes y campañas.",
    tags: ["whatsapp", "canal", "conexión", "mensajería"],
    moduleHref: "conexiones",
    body: [
      {
        type: "p",
        text: "WhatsApp es tu canal principal para llegar a contactos y grupos. La conexión se gestiona desde el módulo Conexiones.",
      },
      {
        type: "steps",
        items: [
          "Ve a Conexiones y elige WhatsApp.",
          "Sigue el flujo de vinculación y autoriza el acceso.",
          "Cuando el estado aparezca en verde («ok»), el canal está listo para enviar.",
        ],
      },
      {
        type: "tip",
        text: "Si el estado aparece en ámbar o rojo, revisa las credenciales o vuelve a autorizar la conexión desde el mismo panel.",
      },
    ],
  },
  {
    slug: "conectar-instagram-y-facebook",
    title: "Conecta Instagram y Facebook",
    category: "canales",
    summary: "Publica en redes sociales conectando tus cuentas de Meta.",
    tags: ["instagram", "facebook", "meta", "redes sociales", "oauth"],
    moduleHref: "conexiones",
    body: [
      {
        type: "p",
        text: "Conecta tus cuentas de Instagram y Facebook para programar y publicar posts, reels, stories y carruseles desde NV Core.",
      },
      {
        type: "steps",
        items: [
          "En Conexiones, elige Instagram o Facebook.",
          "Autoriza el acceso con tu cuenta de Meta y concede los permisos solicitados.",
          "Selecciona la página o cuenta profesional que quieras vincular.",
        ],
      },
      {
        type: "tip",
        text: "Para publicar en Instagram necesitas una cuenta profesional (Business o Creator) vinculada a una página de Facebook.",
      },
    ],
  },
  {
    slug: "importar-contactos-csv",
    title: "Importa tus contactos por CSV",
    category: "audiencia",
    summary: "Migra tu base de contactos desde un archivo CSV.",
    tags: ["contactos", "importar", "csv", "migración", "exportar"],
    moduleHref: "contactos",
    body: [
      {
        type: "p",
        text: "Puedes traer tu base de contactos existente subiendo un archivo CSV. NV Core detecta duplicados por email y te da un resumen de lo importado.",
      },
      {
        type: "steps",
        items: [
          "En Contactos, pulsa «Importar».",
          "Sube un CSV con cabeceras. Se aceptan nombres en español o inglés: name/nombre, email/correo, phone/teléfono, company/empresa, stage/etapa, tags.",
          "Revisa el resumen: contactos creados, omitidos (emails duplicados) y errores por fila.",
        ],
      },
      {
        type: "p",
        text: "También puedes exportar toda tu base con el botón «Exportar», que descarga un CSV con todos los contactos del workspace.",
      },
      {
        type: "tip",
        text: "Las etiquetas (tags) pueden separarse por punto y coma, coma o barra vertical. Si no indicas etapa, el contacto entra como «Lead».",
      },
    ],
  },
  {
    slug: "organizar-audiencia-grupos-segmentos",
    title: "Organiza tu audiencia con grupos y segmentos",
    category: "audiencia",
    summary: "Agrupa contactos manualmente o con criterios dinámicos.",
    tags: ["grupos", "segmentos", "audiencia", "crm", "pipeline"],
    moduleHref: "grupos",
    body: [
      {
        type: "p",
        text: "Los grupos son listas de destinatarios que gestionas manualmente; los segmentos son audiencias dinámicas basadas en criterios. Úsalos para dirigir campañas al público adecuado.",
      },
      {
        type: "steps",
        items: [
          "Crea un grupo en Grupos y añade contactos o números de destino.",
          "Crea un segmento en Segmentos definiendo las condiciones de tu audiencia.",
          "Al lanzar una campaña, elige el grupo o segmento como destino.",
        ],
      },
      {
        type: "tip",
        text: "En Contactos puedes mover contactos entre etapas del pipeline (Lead, Cliente…) arrastrándolos en la vista Kanban.",
      },
    ],
  },
  {
    slug: "crear-y-programar-primer-post",
    title: "Crea y programa tu primer post",
    category: "contenido",
    summary: "Diseña contenido y prográmalo en el calendario.",
    tags: ["post", "publicar", "calendario", "programar", "builder"],
    moduleHref: "builder",
    body: [
      {
        type: "p",
        text: "El Campaign Builder es el editor visual donde diseñas tu contenido. Una vez creado, lo programas y publicas desde el Calendario.",
      },
      {
        type: "steps",
        items: [
          "Abre el Campaign Builder y crea tu diseño o mensaje.",
          "Elige el canal de destino (WhatsApp, Instagram, Facebook).",
          "Ve al Calendario, asigna fecha y hora, y programa la publicación.",
        ],
      },
      {
        type: "tip",
        text: "Un post en estado «programado» se publica automáticamente a su hora; puedes seguir su estado en el Calendario y en el Historial.",
      },
    ],
  },
  {
    slug: "lanzar-campana-omnicanal",
    title: "Lanza una campaña omnicanal",
    category: "contenido",
    summary: "Envía el mismo mensaje por varios canales a la vez.",
    tags: ["campaña", "omnicanal", "envío", "difusión"],
    moduleHref: "campanas",
    body: [
      {
        type: "p",
        text: "Una campaña coordina el envío de contenido a una audiencia por uno o varios canales, con seguimiento de progreso y reintentos automáticos ante fallos temporales.",
      },
      {
        type: "steps",
        items: [
          "En Campañas, crea una nueva campaña y dale nombre.",
          "Elige el contenido y la audiencia (grupo o segmento).",
          "Programa o lanza la campaña y sigue su progreso en tiempo real.",
        ],
      },
      {
        type: "tip",
        text: "Si un envío falla por un error temporal (límite de tasa, red), el sistema reintenta con espera progresiva antes de marcarlo como error.",
      },
    ],
  },
  {
    slug: "generar-contenido-con-ia",
    title: "Genera contenido con IA",
    category: "contenido",
    summary: "Crea variantes de texto y hashtags con el AI Content Studio.",
    tags: ["ia", "ai", "contenido", "hashtags", "copy"],
    moduleHref: "ai",
    body: [
      {
        type: "p",
        text: "El AI Content Studio genera variantes de copy adaptadas al formato y la longitud que necesites, y te sugiere hashtags relevantes.",
      },
      {
        type: "steps",
        items: [
          "Describe el mensaje o la campaña en el AI Content Studio.",
          "Elige formato y longitud, y genera varias variantes.",
          "Mejora una variante, guárdala como plantilla o pide hashtags.",
        ],
      },
      {
        type: "tip",
        text: "El consumo de IA se contabiliza por workspace, de forma que cada espacio controla su propio uso.",
      },
    ],
  },
  {
    slug: "plantillas-con-variables",
    title: "Usa plantillas con variables",
    category: "contenido",
    summary: "Reutiliza mensajes personalizados por destinatario.",
    tags: ["plantillas", "variables", "personalización"],
    moduleHref: "plantillas",
    body: [
      {
        type: "p",
        text: "Las plantillas te permiten reutilizar mensajes y personalizarlos con variables que se rellenan por grupo o por contacto en el momento del envío.",
      },
      {
        type: "steps",
        items: [
          "Crea una plantilla en Plantillas e inserta variables donde quieras personalizar.",
          "Define los valores de las variables por grupo cuando corresponda.",
          "Al enviar, cada destinatario recibe el mensaje con sus valores.",
        ],
      },
    ],
  },
  {
    slug: "gestionar-inbox",
    title: "Gestiona conversaciones en el Inbox",
    category: "canales",
    summary: "Responde y organiza todos tus mensajes en un solo lugar.",
    tags: ["inbox", "conversaciones", "mensajes", "asignar", "etiquetas"],
    moduleHref: "inbox",
    body: [
      {
        type: "p",
        text: "El Inbox unifica las conversaciones entrantes de tus canales. Puedes filtrarlas, asignarlas a miembros del equipo y etiquetarlas.",
      },
      {
        type: "steps",
        items: [
          "Filtra por canal, estado o responsable para encontrar una conversación.",
          "Asigna la conversación a un miembro del equipo.",
          "Añade etiquetas para organizar y priorizar.",
        ],
      },
    ],
  },
  {
    slug: "automatizar-flujos",
    title: "Automatiza flujos sin código",
    category: "automatizacion",
    summary: "Crea automatizaciones visuales con el editor de nodos.",
    tags: ["automatización", "flujos", "workflow", "nodos", "n8n"],
    moduleHref: "automatizaciones",
    body: [
      {
        type: "p",
        text: "El editor de Automatizaciones te permite construir flujos visuales conectando nodos: disparadores, condiciones y acciones, sin escribir código.",
      },
      {
        type: "steps",
        items: [
          "Abre Automatizaciones y crea un flujo nuevo.",
          "Arrastra nodos al lienzo y conéctalos para definir la lógica.",
          "Configura cada nodo desde el panel de inspección y activa el flujo.",
        ],
      },
    ],
  },
  {
    slug: "entender-analytics",
    title: "Entiende tus métricas en Analytics",
    category: "automatizacion",
    summary: "Mide rendimiento con KPIs, series y mapas de calor.",
    tags: ["analytics", "métricas", "kpi", "rendimiento", "informes"],
    moduleHref: "analytics",
    body: [
      {
        type: "p",
        text: "Analytics calcula tus métricas a partir de datos reales: KPIs con variación por periodo, share por canal, series diarias y mapa de calor de actividad.",
      },
      {
        type: "steps",
        items: [
          "Elige el periodo (por ejemplo, 30 o 90 días).",
          "Revisa los KPIs y su variación respecto al periodo anterior.",
          "Analiza las series diarias y el mapa de calor para detectar los mejores momentos.",
        ],
      },
      {
        type: "tip",
        text: "Las métricas muestran «—» hasta que hay datos reales; ningún indicador es ficticio.",
      },
    ],
  },
  {
    slug: "invitar-equipo-y-roles",
    title: "Invita a tu equipo y gestiona roles",
    category: "cuenta",
    summary: "Añade miembros y controla qué puede hacer cada uno.",
    tags: ["equipo", "roles", "permisos", "miembros", "rbac"],
    moduleHref: "configuracion",
    body: [
      {
        type: "p",
        text: "Desde Configuración puedes invitar a tu equipo y asignar roles que determinan qué acciones puede realizar cada persona en el workspace.",
      },
      {
        type: "steps",
        items: [
          "Ve a Configuración y abre la gestión de equipo.",
          "Invita a un miembro por su email.",
          "Asígnale un rol: Owner, Admin, Editor o los roles disponibles según tu plan.",
        ],
      },
      {
        type: "tip",
        text: "Acciones sensibles como eliminar contactos o gestionar el equipo están restringidas a roles concretos (por ejemplo, Owner y Admin).",
      },
    ],
  },
  {
    slug: "planes-y-facturacion",
    title: "Planes y facturación",
    category: "cuenta",
    summary: "Gestiona tu suscripción y los límites de tu plan.",
    tags: ["plan", "facturación", "suscripción", "stripe", "pago"],
    moduleHref: "configuracion",
    body: [
      {
        type: "p",
        text: "Tu plan define los límites y funciones disponibles en el workspace. La facturación se gestiona de forma segura a través de nuestro proveedor de pagos.",
      },
      {
        type: "steps",
        items: [
          "Consulta el estado de tu suscripción en Configuración.",
          "Cambia de plan o gestiona el método de pago desde el portal de facturación.",
          "Los cambios de plan actualizan tus límites automáticamente.",
        ],
      },
    ],
  },
];

/** Look up a single article by its slug. */
export function getHelpArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
