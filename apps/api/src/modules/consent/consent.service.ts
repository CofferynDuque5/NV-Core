import { Global, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { AuditLogger } from "../../common/audit-logger.service";
import { EventBus } from "../../core/events/event-bus.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Palabras con las que un contacto pide no recibir más mensajes. Solo cuenta si
 * el mensaje es SOLO esa palabra (con signos), para no dar de baja a quien
 * escribe "no puedo cancelar mi pedido".
 */
const OPT_OUT_WORDS = [
  "baja",
  "darme de baja",
  "dar de baja",
  "stop",
  "parar",
  "cancelar suscripcion",
  "no mas mensajes",
  "no enviar mas",
  "unsubscribe",
];

const normalize = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when the whole message is an opt-out request ("BAJA", "Stop!", "darme de baja"). */
export function isOptOutMessage(text: string): boolean {
  const t = normalize(text ?? "");
  return t.length > 0 && OPT_OUT_WORDS.includes(t);
}

/** Last 9 digits of a phone / chat handle: tolerant to "+57", spaces and dashes. */
export function phoneKey(handle: string | null | undefined): string | null {
  const d = (handle ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-9) : null;
}

/**
 * Bajas y consentimiento de contactos. Escucha los mensajes entrantes: si el
 * contacto escribe "BAJA"/"STOP", queda dado de baja (optOutAt) y se avisa al
 * equipo. Las secuencias y automatizaciones consultan `isOptedOut` antes de
 * enviar; los mensajes manuales desde el Inbox no se bloquean (los decide una
 * persona).
 */
@Injectable()
export class ConsentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsentService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly audit: AuditLogger,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.on("message.received", (p) =>
      this.onMessage(p).catch((err: unknown) =>
        this.logger.warn(`No se pudo registrar la baja: ${(err as Error).message}`),
      ),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async onMessage(p: { workspaceSlug: string; contactHandle: string; contactName: string; text: string }) {
    if (!this.prisma.enabled || !isOptOutMessage(p.text)) return;
    await this.optOutByHandle(p.workspaceSlug, p.contactHandle, p.contactName);
  }

  /** Contacts of the workspace whose phone matches a chat handle. */
  private async matchByHandle(workspaceSlug: string, handle: string) {
    const key = phoneKey(handle);
    if (!key) return [];
    const candidates = await this.prisma.contact.findMany({
      where: { workspaceSlug, phone: { contains: key.slice(-4) } },
    });
    return candidates.filter((c) => phoneKey(c.phone) === key);
  }

  /**
   * Record an opt-out from a chat. If no contact exists yet, one is created
   * already opted out, so a later import or enrollment can't message them.
   */
  async optOutByHandle(workspaceSlug: string, handle: string, name: string): Promise<number> {
    const now = new Date();
    const matches = await this.matchByHandle(workspaceSlug, handle);
    let ids: string[];
    if (matches.length === 0) {
      if (!phoneKey(handle)) return 0;
      const c = await this.prisma.contact.create({
        data: {
          workspaceSlug,
          name: name || handle,
          phone: handle.startsWith("+") ? handle : `+${handle.replace(/\D/g, "")}`,
          tags: [],
          optOutAt: now,
          optOutSource: "keyword",
        },
      });
      ids = [c.id];
    } else {
      ids = matches.filter((c) => !c.optOutAt).map((c) => c.id);
      if (ids.length === 0) return 0;
      await this.prisma.contact.updateMany({
        where: { id: { in: ids } },
        data: { optOutAt: now, optOutSource: "keyword" },
      });
    }
    await this.stopEnrollments(ids);
    await this.prisma.notification.create({
      data: {
        workspaceSlug,
        type: "warning",
        title: `Baja solicitada: ${name || handle}`,
        meta: "Escribió BAJA/STOP. No recibirá secuencias ni automatizaciones.",
      },
    });
    for (const id of ids) await this.audit.record(workspaceSlug, "system", "contact.opt_out", id);
    this.logger.log(`Baja registrada (${workspaceSlug}): ${ids.length} contacto(s).`);
    return ids.length;
  }

  /** Manual opt-out / opt-in / consent from the panel. */
  async setOptOut(workspaceSlug: string, actor: string, contactId: string, optedOut: boolean): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { id: contactId, workspaceSlug },
      data: optedOut ? { optOutAt: new Date(), optOutSource: "manual" } : { optOutAt: null, optOutSource: null },
    });
    if (optedOut) await this.stopEnrollments([contactId]);
    await this.audit.record(workspaceSlug, actor, optedOut ? "contact.opt_out" : "contact.opt_in", contactId);
  }

  async setConsent(workspaceSlug: string, actor: string, contactId: string, source: string): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { id: contactId, workspaceSlug },
      data: { consentAt: new Date(), consentSource: source },
    });
    await this.audit.record(workspaceSlug, actor, "contact.consent", contactId);
  }

  /** Is the person behind this chat handle opted out? */
  async isHandleOptedOut(workspaceSlug: string, handle: string): Promise<boolean> {
    if (!this.prisma.enabled) return false;
    return (await this.matchByHandle(workspaceSlug, handle)).some((c) => !!c.optOutAt);
  }

  /** Active sequence enrollments of opted-out contacts stop for good. */
  private async stopEnrollments(contactIds: string[]): Promise<void> {
    if (contactIds.length === 0) return;
    await this.prisma.sequenceEnrollment.updateMany({
      where: { contactId: { in: contactIds }, status: "active" },
      data: { status: "opted_out", nextRunAt: null },
    });
  }
}

@Global()
@Module({ providers: [ConsentService], exports: [ConsentService] })
export class ConsentModule {}
