import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";

import { WORKSPACES } from "@nv/domain";

import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceRegistry } from "../common/workspace-registry.service";
import { AuthStore } from "./auth.store";
import { hashPassword } from "./password.util";

/**
 * Optional bootstrap admin. When NV_ADMIN_EMAIL + NV_ADMIN_PASSWORD are set,
 * ensures that user exists (verified) and is Owner of the REAL (DB-created)
 * workspaces, so the operator has full access out of the box.
 *
 * It deliberately does NOT claim the built-in demo workspaces from config: on a
 * fresh install the operator has zero workspaces and is sent to onboarding to
 * create their own business — instead of inheriting sample tenants.
 * No-op when the env vars are missing or the DB is disabled.
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthStore,
    private readonly registry: WorkspaceRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.NV_ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.NV_ADMIN_PASSWORD;
    const name = process.env.NV_ADMIN_NAME?.trim() || "Admin";
    if (!email || !password) return;
    if (!this.prisma.enabled) {
      this.logger.warn("NV_ADMIN_* definido pero la base de datos no está configurada; se omite el seed.");
      return;
    }

    try {
      let user = await this.store.findUserByEmail(email);
      if (!user) {
        user = await this.store.createUser({ email, name, passwordHash: await hashPassword(password) });
        this.logger.log(`Admin "${email}" creado.`);
      }
      await this.store.setEmailVerified(user.id).catch(() => undefined);

      // Limpia membresías heredadas a los workspaces DEMO integrados (de arranques
      // anteriores). Como create() garantiza slugs únicos entre config y DB, un
      // slug de demo nunca corresponde a un workspace real: es seguro quitarlo.
      const builtinSlugs = new Set(WORKSPACES.map((w) => w.slug));
      const current = await this.store.membershipsOf(user.id);
      let purged = 0;
      for (const m of current) {
        if (builtinSlugs.has(m.workspaceSlug)) {
          await this.store.removeMembership(user.id, m.workspaceSlug);
          purged++;
        }
      }
      if (purged > 0) {
        this.logger.log(`Se quitaron ${purged} membresía(s) a workspaces demo del admin.`);
      }

      // Solo los workspaces REALES (creados en la base de datos), no los demos
      // integrados en la config. Así un instalador nuevo empieza en cero y pasa
      // por el onboarding para crear su propio negocio.
      const workspaces = await this.registry.listDbWorkspaces();
      for (const w of workspaces) {
        await this.store.upsertMembership(user.id, w.slug, "Owner");
      }
      this.logger.log(
        `Admin "${email}" listo. Owner de ${workspaces.length} workspace(s) real(es)` +
          (workspaces.length === 0 ? " (irá al onboarding para crear el primero)." : "."),
      );
    } catch (err) {
      this.logger.error(`No se pudo sembrar el admin: ${(err as Error).message}`);
    }
  }
}
