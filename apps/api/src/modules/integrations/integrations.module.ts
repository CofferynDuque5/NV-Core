import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Integration, IntegrationField, ModuleId } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import {
  CredentialsModule,
  CredentialsService,
  PROVIDER_FIELDS,
} from "../credentials/credentials.module";

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
  /** Credential provider id + fields when the key can be pasted in-app. */
  provider?: string;
  fields?: IntegrationField[];
  /** Where to obtain the key + link to the platform (shown in the dialog). */
  helpText?: string;
  helpUrl?: string;
}

const CATALOG: CatalogEntry[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "Inteligencia Artificial",
    description: "Genera captions y variantes A/B con GPT.",
    hue: 158,
    module: "marketplace",
    setupHint: "Pega tu API key de OpenAI (platform.openai.com).",
    configured: (c) => Boolean(c.ai.openai),
    provider: "openai",
    fields: [{ key: "apiKey", label: "API Key", type: "password", placeholder: "sk-…" }],
    helpText:
      "Entra a OpenAI Platform con tu cuenta de ChatGPT, ve a “API keys” y crea una " +
      "(necesitas saldo/créditos en la cuenta). Copia la clave que empieza por “sk-”.",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "Inteligencia Artificial",
    description: "Contenido y asistencia con los modelos Claude.",
    hue: 25,
    module: "marketplace",
    setupHint: "Pega tu API key de Anthropic (console.anthropic.com).",
    configured: (c) => Boolean(c.ai.anthropic),
    provider: "anthropic",
    fields: [{ key: "apiKey", label: "API Key", type: "password", placeholder: "sk-ant-…" }],
    helpText:
      "En la consola de Anthropic ve a “API Keys” → “Create Key”. Copia la clave que " +
      "empieza por “sk-ant-”.",
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "Inteligencia Artificial",
    description: "Generación multimodal con Gemini.",
    hue: 217,
    module: "marketplace",
    setupHint: "Pega tu API key de Gemini (aistudio.google.com).",
    configured: (c) => Boolean(c.ai.gemini),
    provider: "gemini",
    fields: [{ key: "apiKey", label: "API Key", type: "password", placeholder: "AIza…" }],
    helpText:
      "En Google AI Studio pulsa “Get API key” → “Create API key”. Es gratis con tu " +
      "cuenta de Google. Copia la clave que empieza por “AIza”.",
    helpUrl: "https://aistudio.google.com/app/apikey",
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
    description: "Conecta tu cuenta de Telegram con API ID y API Hash.",
    hue: 200,
    module: "marketplace",
    setupHint: "Pega tu API ID y API Hash (gratis en my.telegram.org).",
    configured: (c) => Boolean(c.telegram.apiId && c.telegram.apiHash),
    provider: "telegram",
    fields: [
      { key: "apiId", label: "API ID", type: "text", placeholder: "1234567" },
      {
        key: "apiHash",
        label: "API Hash",
        type: "password",
        placeholder: "0123456789abcdef…",
      },
    ],
    helpText:
      "Entra a my.telegram.org con tu número de teléfono, abre “API development tools” y " +
      "crea una app. Ahí verás tu “App api_id” (API ID) y tu “App api_hash” (API Hash). Es gratis.",
    helpUrl: "https://my.telegram.org/apps",
  },
  {
    id: "pc-agent",
    name: "Facebook e Instagram",
    category: "Mensajería",
    description: "Publica con tu propio inicio de sesión desde “NV Agente PC” (navegador en tu computadora).",
    hue: 221,
    module: "conexiones",
    setupHint: "Descarga NV Agente PC en Conexiones, inicia sesión en Facebook/Instagram y déjalo abierto.",
    configured: () => false,
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
    id: "imgbb",
    name: "ImgBB",
    category: "Media",
    description: "Aloja las imágenes de tus campañas y publicaciones.",
    hue: 168,
    module: "marketplace",
    setupHint: "Pega tu API key de ImgBB (api.imgbb.com).",
    configured: (c) => Boolean(c.imgbb.apiKey),
    provider: "imgbb",
    fields: [{ key: "apiKey", label: "API Key", type: "password", placeholder: "abcdef0123…" }],
    helpText:
      "Regístrate gratis en ImgBB y entra a “About → API” para copiar tu clave. Sirve para " +
      "alojar las imágenes de tus campañas y publicaciones.",
    helpUrl: "https://api.imgbb.com/",
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
    ...(entry.provider ? { provider: entry.provider } : {}),
    ...(entry.fields ? { fields: entry.fields } : {}),
    ...(entry.helpText ? { helpText: entry.helpText } : {}),
    ...(entry.helpUrl ? { helpUrl: entry.helpUrl } : {}),
  }));
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly credentials: CredentialsService,
  ) {}

  /**
   * Real capability catalog; `connected` reflects actual configuration — env
   * config OR credentials the user pasted in-app (DB). So a card flips to
   * "conectada" right after saving its key, without a server restart.
   */
  async catalog(workspaceId: string): Promise<Integration[]> {
    const base = buildCatalog(this.config.get("integrations", { infer: true }));
    return Promise.all(
      base.map(async (item) => {
        if (item.connected || !item.provider) return item;
        const keys = (PROVIDER_FIELDS[item.provider] ?? []).map((f) => f.key);
        const connected =
          keys.length > 0 && (await this.credentials.has(workspaceId, item.provider, keys));
        return connected ? { ...item, connected: true } : item;
      }),
    );
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

@Module({
  imports: [CredentialsModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
