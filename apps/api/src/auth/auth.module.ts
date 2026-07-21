import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

import type { AppConfig } from "../config/configuration";
import { AuthController } from "./auth.controller";
import { MembersController } from "./members.controller";
import { AuthService } from "./auth.service";
import { AuthStore } from "./auth.store";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

/**
 * Global auth module.
 *
 * - Registers `JwtAuthGuard` as the app-wide guard (every route requires a
 *   valid JWT unless marked `@Public()`).
 * - Exports `AuthStore` so the tenant `WorkspaceGuard` and feature modules
 *   (e.g. Team) can resolve memberships.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const auth = config.get("auth", { infer: true });
        return {
          secret: auth.secret,
          // jsonwebtoken accepts strings like "1d"; its type wants a literal.
          signOptions: { expiresIn: auth.expiresIn as unknown as number },
        };
      },
    }),
  ],
  controllers: [AuthController, MembersController],
  providers: [
    AuthStore,
    AuthService,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthStore, AuthService, JwtModule],
})
export class AuthModule {}
