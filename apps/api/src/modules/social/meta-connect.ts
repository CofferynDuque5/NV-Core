import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Post,
  Query,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { MetaCheck, MetaConnectStatus, MetaPage } from "@nv/domain";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { AuditLogger } from "../../common/audit-logger.service";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { Public } from "../../auth/decorators/public.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { MetaGraphError, MetaService, classifyGraphError } from "./meta.service";
import { MetaModule } from "./meta.module";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions asked in «Continuar con Facebook»: list Pages, publish to them and to Instagram. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
] as const;

/** How long a «Continuar con Facebook» result waits for the user to pick a Page. */
const PICK_TTL_MS = 15 * 60 * 1000;

export function metaRedirectUri(apiUrl: string): string {
  return `${apiUrl}/api/integrations/meta/callback`;
}

/** Facebook Login dialog URL (pure — unit tested). */
export function buildMetaAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

/** Plain-Spanish reason for a Graph failure, with what to do about it. */
export function metaErrorText(err: unknown): string {
  if (err instanceof MetaGraphError) {
    if (err.kind === "auth") {
      return "El token venció o no es válido. Genera uno nuevo o usa «Continuar con Facebook».";
    }
    if (err.kind === "permission") {
      return `Faltan permisos en el token (${META_SCOPES.join(", ")}). Vuelve a generarlo marcándolos todos.`;
    }
    if (err.kind === "rate_limit") return "Meta está limitando las consultas. Espera unos minutos y vuelve a intentarlo.";
    if (err.kind === "transient") return "Meta no respondió. Vuelve a intentarlo en un momento.";
    return err.message.replace(/^Graph: /, "Meta: ");
  }
  return (err as Error)?.message || "Error desconocido con Meta.";
}

/** A Page the token can manage, with its own (never-sent-to-the-browser) token. */
interface PageWithToken extends MetaPage {
  token: string;
}

interface MetaState {
  ws: string;
  uid: string;
  p: "meta_oauth";
}

export class MetaPagesDto {
  @ApiPropertyOptional({ description: "Token de usuario o de Página de Meta (Graph)." })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  token?: string;

  @ApiPropertyOptional({ description: "Resultado de «Continuar con Facebook» (pick)." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pick?: string;
}

export class MetaConnectDto extends MetaPagesDto {
  @IsString() @MinLength(1) @MaxLength(64) pageId!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() instagram?: boolean;
}

@Injectable()
export class MetaConnectService {
  private readonly logger = new Logger(MetaConnectService.name);
  /** «Continuar con Facebook» results waiting for a Page choice (single-process, in memory). */
  private readonly picks = new Map<string, { ws: string; token: string; expires: number }>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly meta: MetaService,
    private readonly audit: AuditLogger,
  ) {}

  private app(): { appId?: string; appSecret?: string } {
    return this.config.get("integrations", { infer: true }).meta ?? {};
  }

  private async graph(path: string, params: Record<string, string>): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${GRAPH}/${path}?${new URLSearchParams(params).toString()}`);
    } catch (e) {
      throw new MetaGraphError(`Graph: red no disponible (${(e as Error).message})`, "transient", 0);
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw classifyGraphError(res.status, data);
    return data;
  }

  async status(ws: string): Promise<MetaConnectStatus> {
    const { appId, appSecret } = this.app();
    const rows = this.prisma.enabled
      ? await this.prisma.connection.findMany({ where: { workspaceSlug: ws, channel: { in: ["fb", "ig"] } } })
      : [];
    const row = (ch: string) => rows.find((r) => r.channel === ch && r.token);
    return {
      oauth: Boolean(appId && appSecret),
      facebook: row("fb") ? { id: row("fb")!.handle } : null,
      instagram: row("ig") ? { id: row("ig")!.handle } : null,
    };
  }

  async authUrl(ws: string, userId: string): Promise<string> {
    const { appId, appSecret } = this.app();
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException(
        "«Continuar con Facebook» no está activo: define META_APP_ID y META_APP_SECRET en el servidor. Mientras tanto, pega un token.",
      );
    }
    const state = await this.jwt.signAsync({ ws, uid: userId, p: "meta_oauth" } satisfies MetaState, { expiresIn: "10m" });
    return buildMetaAuthUrl({ appId, redirectUri: metaRedirectUri(this.config.get("apiUrl", { infer: true })), state });
  }

  /** Facebook's redirect: trade the code for a 60-day token and send the user back to pick a Page. */
  async handleCallback(code?: string, state?: string, error?: string): Promise<string> {
    const appUrl = this.config.get("appUrl", { infer: true });
    let payload: MetaState;
    try {
      if (!state) throw new Error("Falta state.");
      payload = await this.jwt.verifyAsync<MetaState>(state);
      if (payload.p !== "meta_oauth") throw new Error("State inválido.");
    } catch (err) {
      this.logger.warn(`Meta callback rejected: ${(err as Error).message}`);
      return `${appUrl}/`;
    }
    const back = `${appUrl}/w/${payload.ws}/conexiones`;
    if (error || !code) return `${back}?meta=cancelado`;
    try {
      const { appId, appSecret } = this.app();
      if (!appId || !appSecret) throw new Error("App de Meta no configurada.");
      const short = await this.graph("oauth/access_token", {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: metaRedirectUri(this.config.get("apiUrl", { infer: true })),
        code,
      });
      const token = await this.longLived(String(short.access_token));
      const pick = randomBytes(18).toString("base64url");
      this.sweepPicks();
      this.picks.set(pick, { ws: payload.ws, token, expires: Date.now() + PICK_TTL_MS });
      return `${back}?meta=elige&pick=${pick}`;
    } catch (err) {
      this.logger.warn(`Meta code exchange failed: ${(err as Error).message}`);
      return `${back}?meta=error`;
    }
  }

  private sweepPicks() {
    const now = Date.now();
    for (const [k, v] of this.picks) if (v.expires < now) this.picks.delete(k);
  }

  /**
   * Swap a short user token (1–2 h, what the Graph API Explorer gives) for a
   * 60-day one when the app is configured; Page tokens read from a long-lived
   * user token do not expire. Without the app, the token is used as is.
   */
  private async longLived(token: string): Promise<string> {
    const { appId, appSecret } = this.app();
    if (!appId || !appSecret) return token;
    try {
      const data = await this.graph("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: token,
      });
      return data?.access_token ? String(data.access_token) : token;
    } catch {
      // A Page token (or one from another app) cannot be exchanged: use it as is.
      return token;
    }
  }

  private tokenFor(ws: string, dto: MetaPagesDto): Promise<string> | string {
    if (dto.pick) {
      this.sweepPicks();
      const p = this.picks.get(dto.pick);
      if (!p || p.ws !== ws) {
        throw new BadRequestException("La autorización de Facebook expiró. Vuelve a pulsar «Continuar con Facebook».");
      }
      return p.token;
    }
    if (dto.token) return this.longLived(dto.token.trim());
    throw new BadRequestException("Pega un token o usa «Continuar con Facebook».");
  }

  /** Pages the token manages, each with its linked Instagram professional account. */
  private async pagesFor(token: string): Promise<PageWithToken[]> {
    const ig = "instagram_business_account{id,username}";
    const toPage = (p: any, pageToken: string): PageWithToken => ({
      id: String(p.id),
      name: String(p.name ?? p.id),
      category: p.category ? String(p.category) : undefined,
      instagram: p.instagram_business_account?.id
        ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username ?? null }
        : null,
      token: pageToken,
    });
    let accountsError: unknown = null;
    try {
      const data = await this.graph("me/accounts", { access_token: token, fields: `id,name,category,access_token,${ig}`, limit: "100" });
      const pages = (data?.data ?? []).filter((p: any) => p?.id).map((p: any) => toPage(p, p.access_token || token));
      if (pages.length > 0) return pages;
    } catch (err) {
      accountsError = err;
    }
    // A Page token: /me is the Page itself.
    try {
      const me = await this.graph("me", { access_token: token, fields: `id,name,category,${ig}` });
      if (me?.id && (me.category || me.instagram_business_account)) return [toPage(me, token)];
    } catch (err) {
      accountsError ??= err;
    }
    if (accountsError) throw new BadRequestException(metaErrorText(accountsError));
    return [];
  }

  async pages(ws: string, dto: MetaPagesDto): Promise<MetaPage[]> {
    const pages = await this.pagesFor(await this.tokenFor(ws, dto));
    if (pages.length === 0) {
      throw new BadRequestException(
        "Ese token no administra ninguna Página de Facebook. Usa una cuenta que sea admin de la Página y marca el permiso pages_show_list.",
      );
    }
    return pages.map(({ token: _t, ...p }) => p);
  }

  /** Save the chosen Page (and its Instagram) as this brand's fb/ig connections in one step. */
  async connect(ws: string, actor: string, dto: MetaConnectDto): Promise<MetaPage> {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    const pages = await this.pagesFor(await this.tokenFor(ws, dto));
    const page = pages.find((p) => p.id === dto.pageId);
    if (!page) throw new BadRequestException("Esa Página no aparece con este token.");
    const save = (channel: "fb" | "ig", handle: string) =>
      this.prisma.connection.upsert({
        where: { workspaceSlug_channel: { workspaceSlug: ws, channel } },
        create: { workspaceSlug: ws, channel, handle, token: page.token, status: "ok", permissions: [...META_SCOPES] },
        update: { handle, token: page.token, status: "ok", expiresAt: null, permissions: [...META_SCOPES] },
      });
    // Publishing goes through each channel's active adapter, which defaults to
    // "Agente en tu PC"; with a Page connected, use the official Graph API.
    const useGraph = (provider: "facebook" | "instagram") =>
      this.prisma.providerSelection.upsert({
        where: { workspaceSlug_provider: { workspaceSlug: ws, provider } },
        create: { workspaceSlug: ws, provider, adapter: "meta-graph" },
        update: { adapter: "meta-graph" },
      });
    await save("fb", page.id);
    await useGraph("facebook");
    if (dto.instagram !== false && page.instagram) {
      await save("ig", page.instagram.id);
      await useGraph("instagram");
    }
    if (dto.pick) this.picks.delete(dto.pick);
    await this.audit.record(ws, actor, "connection.meta", `${page.name}${page.instagram ? " + Instagram" : ""}`);
    const { token: _t, ...out } = page;
    return out;
  }

  /** Ask Meta whether the saved connections still work (name/username, or why not). */
  async check(ws: string): Promise<MetaCheck> {
    const c = await this.meta.creds(ws);
    const one = async (id: string | null | undefined, token: string | null | undefined, fields: string, label: string) => {
      if (!id || !token) return { ok: false, error: `${label} sin conectar.` };
      try {
        const d = await this.graph(id, { access_token: token, fields });
        return { ok: true, name: String(d.name ?? d.username ?? id) };
      } catch (err) {
        return { ok: false, error: metaErrorText(err) };
      }
    };
    const [facebook, instagram] = await Promise.all([
      one(c.fbPageId, c.fbPageToken, "id,name", "Facebook"),
      one(c.igBusinessId, c.igToken, "id,username", "Instagram"),
    ]);
    return { facebook, instagram };
  }
}

@ApiTags("integrations")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/integrations/meta")
export class MetaConnectController {
  constructor(private readonly service: MetaConnectService) {}

  @Get("status")
  status(@WorkspaceId() ws: string) {
    return this.service.status(ws);
  }

  @Get("auth-url")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  async authUrl(@WorkspaceId() ws: string, @CurrentUser() user: AuthenticatedUser) {
    return { url: await this.service.authUrl(ws, user.userId) };
  }

  @Post("pages")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  pages(@WorkspaceId() ws: string, @Body() dto: MetaPagesDto) {
    return this.service.pages(ws, dto);
  }

  @Post("connect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  connect(@WorkspaceId() ws: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: MetaConnectDto) {
    return this.service.connect(ws, user.email, dto);
  }

  @Post("check")
  check(@WorkspaceId() ws: string) {
    return this.service.check(ws);
  }
}

@ApiTags("integrations")
@Controller("integrations/meta")
export class MetaCallbackController {
  constructor(private readonly service: MetaConnectService) {}

  @Public()
  @Get("callback")
  @Redirect()
  async callback(@Query("code") code?: string, @Query("state") state?: string, @Query("error") error?: string) {
    return { url: await this.service.handleCallback(code, state, error) };
  }
}

@Module({
  imports: [MetaModule],
  controllers: [MetaConnectController, MetaCallbackController],
  providers: [MetaConnectService],
})
export class MetaConnectModule {}
