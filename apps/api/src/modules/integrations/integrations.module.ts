import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Integration, ModuleId } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

/** Static capability catalog; `connected` is filled from real config at runtime. */
interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  hue: number;
  /** Where the user configures it in the app (deep-link target). */
  module: ModuleId;
  /** How to enable it (env var / OAuth), shown when not connected. */
  setupHint: string;
  configured: (c: AppConfig["integrations"]) => boolean;
}

const CATALOG: CatalogEntry[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "Inteligencia Artificial",
    description: "Genera captions y variantes A/B con GPT.",
    hue: 158,
    module: "ai",
    setupHint: "Define OPENAI_API_KEY en el servidor.",
    configured: (c) => Boolean(c.ai.openai),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "Inteligencia Artificial",
    description: "Contenido y asistencia con los modelos Claude.",
    hue: 25,
    module: "ai",
    setupHint: "Define ANTHROPIC_API_KEY en el servidor.",
    configured: (c) => Boolean(c.ai.anthropic),
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "Inteligencia Artificial",
    description: "Generación multimodal con Gemini.",
    hue: 217,
    module: "ai",
    setupHint: "Define GEMINI_API_KEY en el servidor.",
    configured: (c) => Boolean(c.ai.gemini),
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "Mensajería",
    description: "Envía y recibe mensajes por la API de WhatsApp.",
    hue: 142,
    module: "conexiones",
    setupHint: "Conecta WhatsApp Cloud API en Conexiones.",
    configured: (c) => Boolean(c.whatsapp.token && c.whatsapp.phoneNumberId),
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "Mensajería",
    description: "Automatiza conversaciones con un bot de Telegram.",
    hue: 200,
    module: "conexiones",
    setupHint: "Define TELEGRAM_BOT_TOKEN y su webhook.",
    configured: (c) => Boolean(c.telegram.botToken),
  },
  {
    id: "meta",
    name: "Meta Graph",
    category: "Mensajería",
    description: "Publica en Facebook e Instagram vía Graph API.",
    hue: 221,
    module: "conexiones",
    setupHint: "Conecta Facebook/Instagram en Conexiones.",
    configured: (c) => Boolean(c.meta.appId && c.meta.appSecret),
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Pagos",
    description: "Suscripciones, facturación y portal de cliente.",
    hue: 258,
    module: "configuracion",
    setupHint: "Define STRIPE_SECRET_KEY y el webhook.",
    configured: (c) => Boolean(c.stripe.secretKey),
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "Media",
    description: "Almacenamiento y transformación de imágenes y video.",
    hue: 210,
    module: "biblioteca",
    setupHint: "Define CLOUDINARY_URL en el servidor.",
    configured: (c) => Boolean(c.cloudinary.url),
  },
  {
    id: "resend",
    name: "Resend",
    category: "Email",
    description: "Correos transaccionales y de marketing.",
    hue: 0,
    module: "configuracion",
    setupHint: "Define RESEND_API_KEY en el servidor.",
    configured: (c) => Boolean(c.resend.apiKey),
  },
  {
    id: "google",
    name: "Google Workspace",
    category: "Productividad",
    description: "Calendario y Drive con OAuth de Google.",
    hue: 4,
    module: "conexiones",
    setupHint: "Configura GOOGLE_CLIENT_ID/SECRET y conecta en Conexiones.",
    configured: (c) => Boolean(c.google.clientId && c.google.clientSecret),
  },
  {
    id: "n8n",
    name: "n8n",
    category: "Automatización",
    description: "Orquesta workflows y disparadores.",
    hue: 330,
    module: "automatizaciones",
    setupHint: "Define N8N_BASE_URL para orquestar flujos.",
    configured: (c) => Boolean(c.n8n.baseUrl),
  },
];

/** Pure derivation: catalog + real config → integrations with connected status. */
export function buildCatalog(integrations: AppConfig["integrations"]): Integration[] {
  return CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    hue: entry.hue,
    module: entry.module,
    setupHint: entry.setupHint,
    connected: entry.configured(integrations),
  }));
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** Real capability catalog; `connected` reflects actual configuration. */
  async catalog(_workspaceId: string): Promise<Integration[]> {
    return buildCatalog(this.config.get("integrations", { infer: true }));
  }
}

@ApiTags("integrations")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/integrations")
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  catalog(@WorkspaceId() workspaceId: string) {
    return this.service.catalog(workspaceId);
  }
}

@Module({ controllers: [IntegrationsController], providers: [IntegrationsService] })
export class IntegrationsModule {}
