import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceRegistry } from "../common/workspace-registry.service";
import { AuthStore } from "./auth.store";
import { hashPassword } from "./password.util";

/**
 * Optional bootstrap admin. When NV_ADMIN_EMAIL + NV_ADMIN_PASSWORD are set,
 * ensures that user exists (verified) and is Owner of every workspace, so the
 * operator has full access out of the box (used by the one-command Docker).
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

      const workspaces = await this.registry.listAll();
      for (const w of workspaces) {
        await this.store.upsertMembership(user.id, w.slug, "Owner");
      }
      this.logger.log(`Admin "${email}" es Owner de ${workspaces.length} workspace(s).`);
    } catch (err) {
      this.logger.error(`No se pudo sembrar el admin: ${(err as Error).message}`);
    }
  }
}
