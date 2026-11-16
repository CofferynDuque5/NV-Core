import { SetMetadata } from "@nestjs/common";

export const ALLOW_DEMO_KEY = "allowDemoWrite";

/** A non-GET route the read-only «Ver demo» account may still call (it changes no brand data). */
export const AllowDemo = () => SetMetadata(ALLOW_DEMO_KEY, true);
