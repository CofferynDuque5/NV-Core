import { randomBytes } from "node:crypto";

import { Injectable, Logger, Module, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { SampleDataService } from "../../common/sample-data.service";
import { hashPassword } from "../../auth/password.util";
import { DEMO_SHOWCASE_SQL } from "./demo-showcase";

/** Marks the demo brand as ours, so a customer brand with the same slug is never touched. */
export const DEMO_OWNER = "sistema-demo";

/**
 * Prepares the public «Ver demo»: one shared account that can only look
 * (every write is refused by the auth guard) and an example brand with
 * fictional customers, chats, groups, campaigns, payments, products, forms,
 * funnels and paused automations (see demo-showcase.ts).
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly samples: SampleDataService,
  ) {}

  onApplicationBootstrap(): void {
    void this.ensure().catch((err: unknown) =>
      this.logger.warn(`No se pudo preparar la demo: ${(err as Error).message}`),
    );
  }

  /** Create (once) the demo account and its example brand. Returns false when off or not possible. */
  async ensure(): Promise<boolean> {
    const demo = this.config.get("demo", { infer: true });
    if (!demo.enabled || !this.prisma.enabled) return false;

    const ws = await this.prisma.workspace.findUnique({ where: { slug: demo.slug } });
    if (ws && ws.createdBy !== DEMO_OWNER) {
      this.logger.warn(
        `La marca "${demo.slug}" ya existe y no es la demo: la demo queda desactivada.`,
      );
      return false;
    }
    if (!ws) {
      await this.prisma.workspace.create({
        data: {
          slug: demo.slug,
          name: "Demo · Tienda de streaming",
          kind: "creative",
          accent: "#5F86F2",
          tagline: "Marca de ejemplo para conocer el panel",
          createdBy: DEMO_OWNER,
        },
      });
    }

    const user = await this.prisma.user.upsert({
      where: { email: demo.email },
      // Nobody signs in with this password: the demo opens through /auth/demo.
      create: {
        email: demo.email,
        name: "Visitante (demo)",
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        demo: true,
        emailVerifiedAt: new Date(),
      },
      update: { demo: true },
    });
    await this.prisma.membership.upsert({
      where: { userId_workspaceSlug: { userId: user.id, workspaceSlug: demo.slug } },
      create: { userId: user.id, workspaceSlug: demo.slug, role: "Visor" },
      update: { role: "Visor" },
    });
    // Only the fictitious visitor belongs to the demo: a real account (e.g. the
    // admin, made Owner of every brand at boot) would show its email to anyone.
    await this.prisma.membership.deleteMany({
      where: { workspaceSlug: demo.slug, userId: { not: user.id } },
    });

    if ((await this.prisma.segment.count({ where: { workspaceSlug: demo.slug } })) === 0) {
      await this.fill(demo.slug);
    }
    await this.showcase(demo.slug);
    this.logger.log(`Demo lista en "${demo.slug}".`);
    return true;
  }

  /** Rebuild the demo's example people, chats, campaigns, payments and products. */
  private async showcase(slug: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const convs = await tx.conversation.findMany({
          where: { workspaceSlug: slug },
          select: { id: true },
        });
        await tx.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
        const camps = await tx.campaign.findMany({
          where: { workspaceSlug: slug },
          select: { id: true },
        });
        await tx.campaignTarget.deleteMany({
          where: { campaignId: { in: camps.map((c) => c.id) } },
        });
        const where = { workspaceSlug: slug };
        await tx.notification.deleteMany({ where });
        await tx.post.deleteMany({ where });
        await tx.task.deleteMany({ where });
        await tx.paymentRequest.deleteMany({ where });
        await tx.paymentMethod.deleteMany({ where });
        await tx.product.deleteMany({ where });
        await tx.sendLog.deleteMany({ where });
        await tx.campaign.deleteMany({ where });
        await tx.group.deleteMany({ where });
        await tx.conversation.deleteMany({ where });
        await tx.contact.deleteMany({ where });
        for (const sql of DEMO_SHOWCASE_SQL) await tx.$executeRawUnsafe(sql, slug);
        // A remote database (Neon) can take longer than Prisma's default 5 s:
        // without room the transaction rolls back and the demo stays empty.
      },
      { maxWait: 20000, timeout: 120000 },
    );
  }

  /** Example forms, funnels, segments and automations (made once). */
  private async fill(slug: string): Promise<void> {
    await this.samples.seed(slug);
    // Nothing that runs by itself.
    await this.prisma.automation.updateMany({
      where: { workspaceSlug: slug },
      data: { status: "pausado" },
    });
  }
}

@Module({ providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
