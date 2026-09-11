import { Module } from "@nestjs/common";

import { CredentialsModule } from "../credentials/credentials.module";
import { MetaService } from "./meta.service";
import { AyrshareService } from "./ayrshare.service";

/**
 * Provides the social transports — Meta Graph (Facebook/Instagram) and Ayrshare
 * (single-key multi-network) — on their own so both the provider adapters
 * (ProvidersModule) and the read-only Social controller can consume them
 * without a circular module dependency.
 */
@Module({
  imports: [CredentialsModule],
  providers: [MetaService, AyrshareService],
  exports: [MetaService, AyrshareService],
})
export class MetaModule {}
