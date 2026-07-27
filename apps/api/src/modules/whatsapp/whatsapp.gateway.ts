import { JwtService } from "@nestjs/jwt";
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import { AuthStore } from "../../auth/auth.store";
import type { WhatsappStatus } from "./whatsapp.types";

function room(workspaceSlug: string): string {
  return `wa:${workspaceSlug}`;
}

/**
 * Real-time channel that pushes the WhatsApp QR and status to the panel.
 * Clients connect to `/whatsapp` and `subscribe` with their access token; the
 * gateway verifies the token and workspace membership before joining the room.
 */
@WebSocketGateway({ namespace: "/whatsapp", cors: { origin: true, credentials: true } })
export class WhatsappGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly store: AuthStore,
  ) {}

  @SubscribeMessage("subscribe")
  async subscribe(
    client: Socket,
    payload: { workspace?: string; token?: string },
  ): Promise<{ ok: boolean }> {
    try {
      const { workspace, token } = payload ?? {};
      if (!workspace || !token) return { ok: false };
      const claims = await this.jwt.verifyAsync<{ sub: string }>(token);
      const membership = await this.store.getMembership(claims.sub, workspace);
      if (!membership) return { ok: false };
      await client.join(room(workspace));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  emitQr(workspaceSlug: string, dataUrl: string): void {
    this.server?.to(room(workspaceSlug)).emit("qr", { dataUrl });
  }

  emitStatus(workspaceSlug: string, status: WhatsappStatus): void {
    this.server?.to(room(workspaceSlug)).emit("status", status);
  }
}
