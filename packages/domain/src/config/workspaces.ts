import { MODULE_IDS, type ModuleId } from "../enums";
import type { Workspace } from "../entities";

/** Every workspace shares the full Core by default. */
const CORE_MODULES: ModuleId[] = [...MODULE_IDS];

/**
 * The 14 workspaces of the platform.
 *
 * This is STRUCTURAL configuration (branding + which modules each company
 * exposes), not operational data. No campaigns, contacts or metrics live
 * here — those load empty until the backend exists.
 */
export const WORKSPACES: Workspace[] = [
  {
    id: "ciclo-creativo",
    slug: "ciclo-creativo",
    name: "Un Ciclo Creativo",
    kind: "creative",
    accent: "#5B8DEF",
    initials: "CC",
    tagline: "Agencia creativa",
    enabledModules: CORE_MODULES,
  },
  {
    id: "codigo-creativo",
    slug: "codigo-creativo",
    name: "Un Código Creativo",
    kind: "software",
    accent: "#7C7CF0",
    initials: "CD",
    tagline: "Producto & software",
    enabledModules: CORE_MODULES,
  },
  {
    id: "pulso-naturaleza",
    slug: "pulso-naturaleza",
    name: "El Pulso de Naturaleza",
    kind: "health",
    accent: "#3FB950",
    initials: "PN",
    tagline: "Bienestar natural",
    enabledModules: CORE_MODULES,
  },
  {
    id: "design-your-core",
    slug: "design-your-core",
    name: "Design Your Core",
    kind: "design",
    accent: "#E3B341",
    initials: "DC",
    tagline: "Diseño & branding",
    enabledModules: CORE_MODULES,
  },
  {
    id: "perla-tour",
    slug: "perla-tour",
    name: "Perla Tour",
    kind: "tourism",
    accent: "#229ED9",
    initials: "PT",
    tagline: "Experiencias de viaje",
    enabledModules: CORE_MODULES,
  },
  {
    id: "varouduva-store",
    slug: "varouduva-store",
    name: "VAROUDUVA STORE",
    kind: "ecommerce",
    accent: "#FE2C55",
    initials: "VS",
    tagline: "E-commerce",
    enabledModules: CORE_MODULES,
  },
  {
    id: "software-studio",
    slug: "software-studio",
    name: "Software Studio",
    kind: "software",
    accent: "#6E6EF2",
    initials: "SS",
    tagline: "Desarrollo de software",
    enabledModules: CORE_MODULES,
  },
  {
    id: "marketing-studio",
    slug: "marketing-studio",
    name: "Marketing Studio",
    kind: "marketing",
    accent: "#F85149",
    initials: "MS",
    tagline: "Growth & performance",
    enabledModules: CORE_MODULES,
  },
  {
    id: "ai-automation-studio",
    slug: "ai-automation-studio",
    name: "AI Automation Studio",
    kind: "ai",
    accent: "#8B5CF6",
    initials: "AI",
    tagline: "Automatización con IA",
    enabledModules: CORE_MODULES,
  },
  {
    id: "fitness",
    slug: "fitness",
    name: "Fitness",
    kind: "fitness",
    accent: "#3FB950",
    initials: "FT",
    tagline: "Entrenamiento & salud",
    enabledModules: CORE_MODULES,
  },
  {
    id: "password-vault",
    slug: "password-vault",
    name: "Password Vault",
    kind: "security",
    accent: "#C9CDD3",
    initials: "PV",
    tagline: "Bóveda de credenciales",
    enabledModules: CORE_MODULES,
  },
  {
    id: "womens-health",
    slug: "womens-health",
    name: "Women's Health",
    kind: "health",
    accent: "#E1306C",
    initials: "WH",
    tagline: "Salud femenina",
    enabledModules: CORE_MODULES,
  },
  {
    id: "nv-streaming",
    slug: "nv-streaming",
    name: "NV Streaming",
    kind: "streaming",
    accent: "#5B8DEF",
    initials: "NV",
    tagline: "Suscripciones de streaming",
    enabledModules: CORE_MODULES,
  },
  {
    id: "nv-stream",
    slug: "nv-stream",
    name: "NV Stream",
    kind: "media",
    accent: "#7C7CF0",
    initials: "NS",
    tagline: "Medios & contenido",
    enabledModules: CORE_MODULES,
  },
];

export const DEFAULT_WORKSPACE_SLUG = WORKSPACES[0]!.slug;

export function getWorkspaceBySlug(slug: string): Workspace | undefined {
  return WORKSPACES.find((w) => w.slug === slug);
}
