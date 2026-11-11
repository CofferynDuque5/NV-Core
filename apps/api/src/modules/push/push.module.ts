import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  type OnModuleInit,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsObject, IsString, MaxLength, ValidateNested } from "class-validator";
import type { Request } from "express";

import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { CryptoService } from "../../common/crypto/crypto.service";
import { describeDevice } from "../../common/device";
import { EventBus } from "../../core/events/event-bus.service";
import { PrismaService } from "../../prisma/prisma.service";
import { chatNotice, isPushEndpoint, isPushKeys } from "./push-rules";

/* eslint-disable @typescript-eslint/no-require-imports */
interface WebPushLib {
  generateVAPIDKeys(): { publicKey: string; privateKey: string };
  sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number; urgency?: string; timeout?: number },
  ): Promise<{ statusCode: number }>;
}
const webpush = require("web-push") as WebPushLib;

class PushKeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(60) auth!: string;
}

export class PushSubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
  @IsObject() @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

const VAPID_KEY = "vapid";
/** Most devices one member can register. */
const MAX_DEVICES = 10;

/**
 * Browser push: new chat messages reach the member's phone or computer even
 * when the panel is closed. Keys (VAPID) come from VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY, or are generated once and kept encrypted in the database.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.events.on("message.received", (p) => {
      void this.notifyChat(p).catch((err: unknown) => this.logger.warn(`Aviso push no enviado: ${(err as Error).message}`));
    });
  }

  private vapid(): Promise<{ publicKey: string; privateKey: string }> {
    if (!this.keys) {
      this.keys = this.loadKeys().catch((err) => {
        this.keys = null;
        throw err;
      });
    }
    return this.keys;
  }

  private async loadKeys(): Promise<{ publicKey: string; privateKey: string }> {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate };
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    const row = await this.prisma.appKey.findUnique({ where: { name: VAPID_KEY } });
    if (row) return JSON.parse(this.crypto.decrypt(row.value)) as { publicKey: string; privateKey: string };
    const fresh = webpush.generateVAPIDKeys();
    try {
      await this.prisma.appKey.create({ data: { name: VAPID_KEY, value: this.crypto.encrypt(JSON.stringify(fresh)) } });
      return fresh;
    } catch {
      // Another process created them at the same moment: use theirs.
      const again = await this.prisma.appKey.findUniqueOrThrow({ where: { name: VAPID_KEY } });
      return JSON.parse(this.crypto.decrypt(again.value)) as { publicKey: string; privateKey: string };
    }
  }

  private subject(): string {
    const web = this.config.get("appUrl", { infer: true });
    return process.env.VAPID_SUBJECT?.trim() || (web?.startsWith("https://") ? web : "mailto:nvmarketing@nvcorx.com");
  }

  async publicKey(): Promise<{ publicKey: string }> {
    return { publicKey: (await this.vapid()).publicKey };
  }

  async subscribe(user: AuthenticatedUser, dto: PushSubscribeDto, userAgent: string | null): Promise<{ ok: true }> {
    if (user.demo) throw new BadRequestException("La demo no recibe avisos.");
    if (!isPushEndpoint(dto.endpoint)) throw new BadRequestException("Este navegador no es compatible con los avisos.");
    if (!isPushKeys(dto.keys?.p256dh, dto.keys?.auth)) throw new BadRequestException("Datos de aviso no válidos.");
    const device = userAgent ? describeDevice(userAgent) : null;
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId: user.userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, device },
      update: { userId: user.userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth, device },
    });
    // Keep the newest devices only.
    const mine = await this.prisma.pushSubscription.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (mine.length > MAX_DEVICES) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: mine.slice(MAX_DEVICES).map((m) => m.id) } } });
    }
    return { ok: true };
  }

  async unsubscribe(user: AuthenticatedUser, endpoint: string): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId: user.userId, endpoint } });
    return { ok: true };
  }

  async status(user: AuthenticatedUser): Promise<{ devices: { device: string | null; createdAt: string }[] }> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      select: { device: true, createdAt: true },
    });
    return { devices: rows.map((r) => ({ device: r.device, createdAt: r.createdAt.toISOString() })) };
  }

  /** A test notice to the member's own devices. */
  async test(user: AuthenticatedUser): Promise<{ sent: number }> {
    const sent = await this.sendTo([user.userId], {
      title: "NV Marketing",
      body: "Los avisos de mensajes nuevos ya llegan a este equipo.",
      url: "/",
      tag: "push-test",
    });
    if (!sent) throw new BadRequestException("No hay equipos con avisos activados. Actívalos primero en este navegador.");
    return { sent };
  }

  /** New message from a contact → every member of the brand (except the demo account). */
  async notifyChat(p: {
    workspaceSlug: string;
    channel: string;
    contactName: string;
    text: string;
    conversationId?: string;
  }): Promise<number> {
    if (!this.prisma.enabled) return 0;
    const members = await this.prisma.membership.findMany({
      where: { workspaceSlug: p.workspaceSlug, user: { demo: false } },
      select: { userId: true },
    });
    if (!members.length) return 0;
    const ws = await this.prisma.workspace.findUnique({ where: { slug: p.workspaceSlug }, select: { name: true } });
    return this.sendTo(
      members.map((m) => m.userId),
      chatNotice({ ...p, workspaceName: ws?.name ?? null }),
    );
  }

  private async sendTo(userIds: string[], notice: { title: string; body: string; url: string; tag: string }): Promise<number> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (!subs.length) return 0;
    const keys = await this.vapid();
    const payload = JSON.stringify(notice);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        if (!isPushEndpoint(s.endpoint)) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          return;
        }
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            vapidDetails: { subject: this.subject(), ...keys },
            TTL: 24 * 60 * 60,
            urgency: "high",
            timeout: 15_000,
          });
          sent++;
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date() } }).catch(() => undefined);
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          // The browser dropped the subscription (uninstalled, permission removed): forget it.
          if (code === 404 || code === 410 || code === 403) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Aviso push falló (${code ?? "sin código"}): ${(err as Error).message}`);
          }
        }
      }),
    );
    return sent;
  }
}

@ApiTags("push")
@ApiBearerAuth()
@Controller("push")
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("key")
  key() {
    return this.push.publicKey();
  }

  @Get("devices")
  devices(@CurrentUser() user: AuthenticatedUser) {
    return this.push.status(user);
  }

  @Post("subscribe")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushSubscribeDto, @Req() req: Request) {
    return this.push.subscribe(user, dto, String(req.headers["user-agent"] ?? "") || null);
  }

  @Delete("subscribe")
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushUnsubscribeDto) {
    return this.push.unsubscribe(user, dto.endpoint);
  }

  @Post("test")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.push.test(user);
  }
}

@Module({
  controllers: [PushController],
  providers: [PushService, CryptoService],
  exports: [PushService],
})
export class PushModule {}
