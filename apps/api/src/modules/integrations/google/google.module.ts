import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Query,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { GoogleStatus } from "@nv/domain";

import type { AppConfig } from "../../../config/configuration";
import { WorkspaceId } from "../../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../../common/tenant/workspace.guard";
import { PrismaService } from "../../../prisma/prisma.service";
import { CryptoService } from "../../../common/crypto/crypto.service";
import { Public } from "../../../auth/decorators/public.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../../auth/auth.types";
import { buildGoogleAuthUrl, GOOGLE_SCOPES, googleRedirectUri } from "./google.oauth";

interface GoogleState {
  ws: string;
  uid: string;
  p: "google_oauth";
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
  ) {}

  private google() {
    return this.config.get("integrations", { infer: true }).google;
  }

  private requireCreds(): { clientId: string; clientSecret: string } {
    const g = this.google();
    if (!g.clientId || !g.clientSecret) {
      throw new ServiceUnavailableException(
        "Google OAuth no configurado. Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.",
      );
    }
    return { clientId: g.clientId, clientSecret: g.clientSecret };
  }

  async status(workspaceId: string): Promise<GoogleStatus> {
    const g = this.google();
    const connection = this.prisma.enabled
      ? await this.prisma.googleConnection.findUnique({ where: { workspaceSlug: workspaceId } })
      : null;
    return {
      configured: Boolean(g.clientId && g.clientSecret),
      connected: Boolean(connection),
      email: connection?.email ?? null,
    };
  }

  async authUrl(workspaceId: string, userId: string): Promise<string> {
    const { clientId } = this.requireCreds();
    const state = await this.jwt.signAsync(
      { ws: workspaceId, uid: userId, p: "google_oauth" } satisfies GoogleState,
      { expiresIn: "10m" },
    );
    return buildGoogleAuthUrl({
      clientId,
      redirectUri: googleRedirectUri(this.config.get("apiUrl", { infer: true })),
      state,
      scopes: GOOGLE_SCOPES,
    });
  }

  /** Handle Google's redirect. Always returns a frontend URL to redirect to. */
  async handleCallback(code?: string, state?: string, error?: string): Promise<string> {
    const appUrl = this.config.get("appUrl", { infer: true });
    const fail = (ws: string) => `${appUrl}/w/${ws}/conexiones?google=error`;

    let payload: GoogleState;
    try {
      if (error) throw new Error(`Google devolvió un error: ${error}`);
      if (!code || !state) throw new Error("Faltan parámetros code/state.");
      payload = await this.jwt.verifyAsync<GoogleState>(state);
      if (payload.p !== "google_oauth") throw new Error("State inválido.");
    } catch (err) {
      this.logger.warn(`Google callback rejected: ${(err as Error).message}`);
      // Unknown workspace → send back to a generic location.
      return `${appUrl}/`;
    }

    try {
      const { clientId, clientSecret } = this.requireCreds();
      const tokens = await this.exchangeCode(code!, clientId, clientSecret);
      const email = await this.fetchEmail(tokens.access_token);
      await this.persist(payload.ws, tokens, email);
      return `${appUrl}/w/${payload.ws}/conexiones?google=connected`;
    } catch (err) {
      this.logger.warn(`Google token exchange failed: ${(err as Error).message}`);
      return fail(payload.ws);
    }
  }

  async disconnect(workspaceId: string): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.googleConnection.deleteMany({ where: { workspaceSlug: workspaceId } });
  }

  /** Decrypted OAuth tokens for the workspace (for Calendar/Drive calls). */
  async getTokens(
    workspaceId: string,
  ): Promise<{ accessToken: string; refreshToken: string | null } | null> {
    if (!this.prisma.enabled) return null;
    const conn = await this.prisma.googleConnection.findUnique({
      where: { workspaceSlug: workspaceId },
    });
    if (!conn) return null;
    return {
      accessToken: this.crypto.decrypt(conn.accessToken),
      refreshToken: conn.refreshToken ? this.crypto.decrypt(conn.refreshToken) : null,
    };
  }

  private async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(this.config.get("apiUrl", { infer: true })),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>;
  }

  private async fetchEmail(accessToken: string): Promise<string | null> {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  }

  private async persist(
    workspaceSlug: string,
    tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string },
    email: string | null,
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    // Encrypt OAuth tokens at rest.
    const data = {
      email,
      accessToken: this.crypto.encrypt(tokens.access_token),
      refreshToken: this.crypto.encryptNullable(tokens.refresh_token),
      scope: tokens.scope,
      expiresAt,
    };
    await this.prisma.googleConnection.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, ...data },
      // Keep a previously stored refresh token if Google omits it on re-consent.
      update: { ...data, refreshToken: data.refreshToken ?? undefined },
    });
  }
}

@ApiTags("integrations")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/integrations/google")
export class GoogleController {
  constructor(private readonly service: GoogleService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Get("auth-url")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  async authUrl(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return { url: await this.service.authUrl(workspaceId, user.userId) };
  }

  @Delete()
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  disconnect(@WorkspaceId() workspaceId: string) {
    return this.service.disconnect(workspaceId);
  }
}

@ApiTags("integrations")
@Controller("integrations/google")
export class GoogleCallbackController {
  constructor(private readonly service: GoogleService) {}

  @Public()
  @Get("callback")
  @Redirect()
  async callback(
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ) {
    const url = await this.service.handleCallback(code, state, error);
    return { url };
  }
}

@Module({
  controllers: [GoogleController, GoogleCallbackController],
  providers: [GoogleService],
})
export class GoogleModule {}
