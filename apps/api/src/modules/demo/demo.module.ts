import { randomBytes } from "node:crypto";

import { Injectable, Logger, Module, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { SampleDataService } from "../../common/sample-data.service";
import { hashPassword } from "../../auth/password.util";

/** Marks the demo brand as ours, so a customer brand with the same slug is never touched. */
export const DEMO_OWNER = "sistema-demo";

/**
 * Example numbers for the demo: Venezuela has no 000 area code, so they can't
 * belong to anyone (the old example data used real-looking numbers).
 */
export function demoPhone(i: number): string {
  return `+58 000 000 ${String(100 + i).padStart(4, "0")}`;
}

/** Example chats shown in the demo Inbox: [name, handle, messages (in/out)]. */
export const DEMO_CHATS: [string, string, ["in" | "out", string][]][] = [
  ["María González", "+580000000101", [
    ["in", "Hola, ¿tienen Disney+ disponible?"],
    ["out", "¡Hola María! Sí, tenemos perfiles de Disney+ por 30 días. ¿Te paso los precios?"],
    ["in", "Sí, por favor 🙏"],
  ]],
  ["Carlos Pérez", "+580000000102", [
    ["in", "Buenas, mi HBO Max vence mañana, ¿cómo renuevo?"],
    ["out", "Hola Carlos, te envío el enlace de pago y lo activamos apenas confirmes."],
  ]],
  ["Valentina Díaz", "+580000000109", [
    ["in", "¿Tienen combos de Netflix + Spotify?"],
  ]],
];

/** Example products for the demo Tienda (prices are illustrative). */
export const DEMO_PRODUCTS = [
  { name: "Netflix · 1 perfil", category: "Streaming", prices: { USD: "4", VES: "160" }, description: "Perfil propio por 30 días." },
  { name: "Disney+ · 1 perfil", category: "Streaming", prices: { USD: "3", VES: "120" }, description: "Perfil propio por 30 días." },
  { name: "Spotify Premium", category: "Música", prices: { USD: "3", COP: "12000" }, description: "Cuenta individual por 30 días." },
  { name: "Combo Netflix + Spotify", category: "Combos", prices: { USD: "6.5" }, description: "Los dos servicios con un solo pago." },
];

/**
 * Prepares the public «Ver demo»: one shared account that can only look
 * (every write is refused by the auth guard) and an example brand with
 * contacts, chats, products, segments, forms, funnels and paused
 * automations. Nothing in it can be messaged: the numbers are fictitious and
 * the brand has no connections.
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
      this.logger.warn(`La marca "${demo.slug}" ya existe y no es la demo: la demo queda desactivada.`);
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
    await this.prisma.membership.deleteMany({ where: { workspaceSlug: demo.slug, userId: { not: user.id } } });

    if ((await this.prisma.contact.count({ where: { workspaceSlug: demo.slug } })) === 0) {
      await this.fill(demo.slug);
      this.logger.log(`Demo lista en "${demo.slug}".`);
    }
    return true;
  }

  /** Example content of the demo brand. */
  private async fill(slug: string): Promise<void> {
    await this.samples.seed(slug);
    // Fictitious numbers only, and nothing that runs by itself.
    const contacts = await this.prisma.contact.findMany({ where: { workspaceSlug: slug }, orderBy: { createdAt: "asc" } });
    for (const [i, c] of contacts.entries()) {
      await this.prisma.contact.update({ where: { id: c.id }, data: { phone: demoPhone(i + 1), email: null } });
    }
    await this.prisma.automation.updateMany({ where: { workspaceSlug: slug }, data: { status: "pausado" } });

    const now = Date.now();
    for (const [ci, [name, handle, lines]] of DEMO_CHATS.entries()) {
      const conv = await this.prisma.conversation.create({
        data: { workspaceSlug: slug, channel: "wa", contactName: name, contactHandle: handle, labels: ci === 0 ? ["ventas"] : [] },
      });
      const start = now - (ci + 1) * 3_600_000;
      await this.prisma.message.createMany({
        data: lines.map(([direction, text], i) => ({
          conversationId: conv.id,
          direction,
          text,
          createdAt: new Date(start + i * 90_000),
        })),
      });
    }
    await this.prisma.product.createMany({
      data: DEMO_PRODUCTS.map((p) => ({ workspaceSlug: slug, ...p })),
    });
  }
}

@Module({ providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
