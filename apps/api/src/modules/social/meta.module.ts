import { Module } from "@nestjs/common";

import { MetaService } from "./meta.service";

/**
 * Provides the Meta Graph transport (Facebook/Instagram) on its own so both the
 * provider adapters (ProvidersModule) and the read-only Social controller can
 * consume it without a circular module dependency.
 */
@Module({
  providers: [MetaService],
  exports: [MetaService],
})
export class MetaModule {}
