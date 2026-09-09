import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsObject } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

/**
 * Which fields each integration provider stores. Drives both the save API and
 * the in-app "Configurar" dialog, so the user can paste keys/tokens without
 * touching server env vars. Keep keys in sync with the web catalog fields.
 */
export const PROVIDER_FIELDS: Record<string, { key: string; secret: boolean }[]> = {
  openai: [{ key: "apiKey", secret: true }],
  anthropic: [{ key: "apiKey", secret: true }],
  gemini: [{ key: "apiKey", secret: true }],
  telegram: [
    { key: "apiId", secret: false },
    { key: "apiHash", secret: true },
  ],
  imgbb: [{ key: "apiKey", secret: true }],
};

export type ProviderId = keyof typeof PROVIDER_FIELDS | string;

/**
 * Per-workspace integration credentials, encrypted at rest. Values are read
 * DB-first with an env fallback (see each consumer), so pasting a key in the UI
 * takes effect immediately while server-configured deployments keep working.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Decrypted fields for a provider in a workspace ({} when none stored). */
  async get(workspaceSlug: string, provider: ProviderId): Promise<Record<string, string>> {
    if (!this.prisma.enabled) return {};
    const row = await this.prisma.integrationCredential.findUnique({
      where: { workspaceSlug_provider: { workspaceSlug, provider: String(provider) } },
    });
    if (!row) return {};
    try {
      const parsed = JSON.parse(this.crypto.decrypt(row.data));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  /** Store (encrypted) the non-empty fields for a provider. */
  async set(
    workspaceSlug: string,
    provider: ProviderId,
    data: Record<string, unknown>,
  ): Promise<void> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      const val = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
      if (val) clean[k] = val;
    }
    const enc = this.crypto.encrypt(JSON.stringify(clean));
    await this.prisma.integrationCredential.upsert({
      where: { workspaceSlug_provider: { workspaceSlug, provider: String(provider) } },
      create: { workspaceSlug, provider: String(provider), data: enc },
      update: { data: enc },
    });
  }

  async remove(workspaceSlug: string, provider: ProviderId): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.integrationCredential.deleteMany({
      where: { workspaceSlug, provider: String(provider) },
    });
  }

  /** True when all `keys` are present for this provider in the DB. */
  async has(workspaceSlug: string, provider: ProviderId, keys: string[]): Promise<boolean> {
    const data = await this.get(workspaceSlug, provider);
    return keys.every((k) => Boolean(data[k]));
  }
}

class SaveCredentialDto {
  // El ValidationPipe global usa whitelist+forbidNonWhitelisted; sin este
  // decorador la propiedad se descarta y la petición se rechaza (400). Con él,
  // el panel puede guardar las claves de API (OpenAI, Telegram, ImgBB…).
  @IsObject()
  data!: Record<string, unknown>;
}

/** Mask a secret so the UI can show "set" without leaking it. */
function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

@ApiTags("credentials")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/credentials")
export class CredentialsController {
  constructor(private readonly service: CredentialsService) {}

  /** Which providers have credentials stored, with masked previews (never raw). */
  @Get()
  async list(@WorkspaceId() workspaceId: string) {
    const out: Record<string, { configured: boolean; preview: Record<string, string> }> = {};
    for (const provider of Object.keys(PROVIDER_FIELDS)) {
      const data = await this.service.get(workspaceId, provider);
      const fields = PROVIDER_FIELDS[provider];
      const configured = fields.every((f) => Boolean(data[f.key]));
      const preview: Record<string, string> = {};
      for (const f of fields) {
        if (!data[f.key]) continue;
        preview[f.key] = f.secret ? maskValue(data[f.key]) : data[f.key];
      }
      out[provider] = { configured, preview };
    }
    return out;
  }

  @Post(":provider")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async save(
    @WorkspaceId() workspaceId: string,
    @Param("provider") provider: string,
    @Body() dto: SaveCredentialDto,
  ) {
    if (!PROVIDER_FIELDS[provider]) {
      throw new UnprocessableEntityException(`Proveedor desconocido: ${provider}`);
    }
    await this.service.set(workspaceId, provider, dto.data ?? {});
    return { ok: true };
  }

  @Delete(":provider")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async remove(@WorkspaceId() workspaceId: string, @Param("provider") provider: string) {
    await this.service.remove(workspaceId, provider);
    return { ok: true };
  }
}

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService, CryptoService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
