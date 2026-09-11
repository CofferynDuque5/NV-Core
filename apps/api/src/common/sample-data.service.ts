import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Rellena un workspace con datos de ejemplo REALISTAS (enfocados en la venta de
 * cuentas de streaming) para que ninguna sección aparezca vacía: contactos,
 * segmentos, formularios, embudos, secuencias, afiliados y automatizaciones
 * (agente de ventas, cobros y soporte). Todo es editable por el usuario.
 *
 * Es idempotente: si el workspace ya tiene contactos, no hace nada (así no pisa
 * lo que el usuario haya editado).
 */
@Injectable()
export class SampleDataService {
  private readonly logger = new Logger(SampleDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Siembra datos de ejemplo si el workspace está vacío. */
  async seedIfEmpty(workspaceSlug: string): Promise<void> {
    if (!this.prisma.enabled) return;
    try {
      const contacts = await this.prisma.contact.count({ where: { workspaceSlug } });
      if (contacts > 0) return; // ya tiene datos; no tocar
      await this.seed(workspaceSlug);
      this.logger.log(`Datos de ejemplo cargados en "${workspaceSlug}".`);
    } catch (err) {
      this.logger.warn(`No se pudieron cargar datos de ejemplo: ${(err as Error).message}`);
    }
  }

  private async seed(ws: string): Promise<void> {
    const now = Date.now();
    const daysAgo = (d: number) => new Date(now - d * 86_400_000);

    // ── Contactos (clientes y prospectos de streaming) ──────────────────────
    await this.prisma.contact.createMany({
      data: [
        { workspaceSlug: ws, name: "Julio Ramírez", phone: "+584121112233", email: "julio@example.com", company: "Cliente Netflix", tags: ["netflix", "cliente", "vip"], stage: "Cliente", lastContactAt: daysAgo(2) },
        { workspaceSlug: ws, name: "María González", phone: "+584129109871", email: "maria@example.com", tags: ["disney+", "prospecto"], stage: "Lead", lastContactAt: daysAgo(1) },
        { workspaceSlug: ws, name: "Carlos Pérez", phone: "+584141233233", email: "carlos@example.com", tags: ["hbo", "renovacion"], stage: "Cliente", lastContactAt: daysAgo(5) },
        { workspaceSlug: ws, name: "Ana Torres", phone: "+584125556677", tags: ["spotify"], stage: "Lead", lastContactAt: daysAgo(3) },
        { workspaceSlug: ws, name: "Luis Ramírez", phone: "+584126393214", tags: ["prime", "cliente"], stage: "Cliente", lastContactAt: daysAgo(8) },
        { workspaceSlug: ws, name: "Daniela Suárez", phone: "+584127778899", email: "daniela@example.com", tags: ["netflix"], stage: "En riesgo", lastContactAt: daysAgo(20) },
        { workspaceSlug: ws, name: "Pedro Martínez", phone: "+584128889900", tags: ["combo", "vip"], stage: "Cliente", lastContactAt: daysAgo(4) },
        { workspaceSlug: ws, name: "Gabriela Rojas", phone: "+584123334455", tags: ["disney+", "prospecto"], stage: "Lead" },
        { workspaceSlug: ws, name: "José Fernández", phone: "+584124445566", tags: ["vix"], stage: "Inactivo", lastContactAt: daysAgo(45) },
        { workspaceSlug: ws, name: "Valentina Díaz", phone: "+584122223344", email: "valen@example.com", tags: ["crunchyroll", "cliente"], stage: "Cliente", lastContactAt: daysAgo(1) },
      ],
    });

    // ── Segmentos ───────────────────────────────────────────────────────────
    await this.prisma.segment.createMany({
      data: [
        { workspaceSlug: ws, name: "Clientes activos", color: "#3FB950", match: "all", rules: [{ field: "stage", operator: "equals", value: "Cliente" }] },
        { workspaceSlug: ws, name: "Leads nuevos (7 días)", color: "#5B8DEF", match: "all", rules: [{ field: "stage", operator: "equals", value: "Lead" }, { field: "createdAt", operator: "in_last_days", value: "7" }] },
        { workspaceSlug: ws, name: "En riesgo / por renovar", color: "#E3B341", match: "any", rules: [{ field: "stage", operator: "equals", value: "En riesgo" }, { field: "tags", operator: "has_tag", value: "renovacion" }] },
        { workspaceSlug: ws, name: "Interesados en Netflix", color: "#FE2C55", match: "all", rules: [{ field: "tags", operator: "has_tag", value: "netflix" }] },
      ],
    });

    // ── Formularios (captación de leads) ────────────────────────────────────
    await this.prisma.form.createMany({
      data: [
        {
          workspaceSlug: ws,
          name: "Pedir cuenta de streaming",
          fields: [
            { key: "name", label: "Tu nombre", required: true },
            { key: "phone", label: "WhatsApp", required: true },
            { key: "email", label: "Correo (opcional)", required: false },
          ],
          tags: ["formulario", "prospecto"],
          stage: "Lead",
          submitLabel: "Quiero mi cuenta",
          successMessage: "¡Gracias! Te escribimos por WhatsApp con las opciones y precios. 🎬",
          views: 128,
          submissions: 34,
        },
        {
          workspaceSlug: ws,
          name: "Lista de espera combos",
          fields: [
            { key: "name", label: "Nombre", required: true },
            { key: "phone", label: "WhatsApp", required: true },
          ],
          tags: ["combo", "waitlist"],
          stage: "Lead",
          submitLabel: "Anotarme",
          successMessage: "¡Anotado! Te avisamos cuando abran cupos del combo. 🍿",
          views: 76,
          submissions: 19,
        },
      ],
    });

    // ── Embudos ─────────────────────────────────────────────────────────────
    await this.prisma.funnel.createMany({
      data: [
        {
          workspaceSlug: ws,
          name: "Embudo de venta streaming",
          steps: [
            { type: "optin", title: "Captación", subtitle: "Formulario: pide tu cuenta" },
            { type: "sales", title: "Oferta", subtitle: "Precios y combos por WhatsApp" },
            { type: "thankyou", title: "Cliente", subtitle: "Entrega de la cuenta + garantía" },
          ],
        },
        {
          workspaceSlug: ws,
          name: "Reactivación de inactivos",
          steps: [
            { type: "optin", title: "Reenganche", subtitle: "Mensaje '¿Volvemos?'" },
            { type: "sales", title: "Descuento", subtitle: "Oferta de renovación" },
            { type: "thankyou", title: "Reactivado", subtitle: "Cuenta renovada" },
          ],
        },
      ],
    });

    // ── Secuencias (autoresponders) ─────────────────────────────────────────
    await this.prisma.sequence.createMany({
      data: [
        {
          workspaceSlug: ws,
          name: "Bienvenida nuevos clientes",
          status: "active",
          steps: [
            { id: "s1", delayDays: 0, channel: "wa", body: "¡Hola {{nombre}}! 🎬 Gracias por tu compra en NV Streaming. Aquí tienes los datos de tu cuenta. Cualquier duda, escríbeme." },
            { id: "s2", delayDays: 2, channel: "wa", body: "Hola {{nombre}}, ¿todo bien con tu cuenta? Si algo no funciona te lo resuelvo al instante. 🙌" },
            { id: "s3", delayDays: 25, channel: "wa", body: "{{nombre}}, tu suscripción vence pronto. ¿Te la renuevo con el mismo precio? 😉" },
          ],
        },
        {
          workspaceSlug: ws,
          name: "Recuperar carrito / interesados",
          status: "active",
          steps: [
            { id: "r1", delayDays: 0, channel: "wa", body: "Hola {{nombre}}, vi que te interesó una cuenta. ¿Te paso los precios y combos? 📺" },
            { id: "r2", delayDays: 1, channel: "wa", body: "{{nombre}}, hoy tengo promo en combos (Netflix + Disney+). ¿Te reservo uno?" },
          ],
        },
      ],
    });

    // ── Afiliados ───────────────────────────────────────────────────────────
    await this.prisma.affiliate.createMany({
      data: [
        { workspaceSlug: ws, name: "Pedro (revendedor)", email: "pedro@example.com", code: `PEDRO-${ws}`.slice(0, 24), commissionPct: 20, status: "active", clicks: 240, conversions: 31, earnings: 155 },
        { workspaceSlug: ws, name: "Laura (influencer)", email: "laura@example.com", code: `LAURA-${ws}`.slice(0, 24), commissionPct: 15, status: "active", clicks: 512, conversions: 44, earnings: 198 },
      ],
    });

    // ── Automatizaciones (agente de ventas, cobros, soporte) ────────────────
    await this.prisma.automation.createMany({
      data: [
        {
          workspaceSlug: ws,
          name: "🤖 Agente de Ventas (IA)",
          status: "activo",
          description:
            "Cuando llega un mensaje nuevo, la IA responde con precios/combos, califica al interesado y lo crea como contacto en etapa Lead.",
          nodes: [
            { id: "n1", type: "trigger", label: "Mensaje entrante (WhatsApp/Telegram)", x: 80, y: 80, config: { event: "message.received" } },
            { id: "n2", type: "action", label: "IA responde con precios y combos", x: 80, y: 200, config: { kind: "ai_reply", prompt: "Eres vendedor de cuentas de streaming (Netflix, Disney+, HBO, Prime, Spotify). Responde con precios, combos y cierra la venta con amabilidad." } },
            { id: "n3", type: "cond", label: "¿Mostró interés en comprar?", x: 80, y: 320, config: { field: "intent", equals: "compra" } },
            { id: "n4", type: "action", label: "Crear contacto (etapa Lead) + etiqueta 'interesado'", x: 320, y: 420, config: { kind: "create_contact", stage: "Lead", tag: "interesado" } },
            { id: "n5", type: "action", label: "Notificarme para cerrar la venta", x: 320, y: 520, config: { kind: "notify" } },
          ],
          edges: [
            { id: "e1", from: "n1", to: "n2" },
            { id: "e2", from: "n2", to: "n3" },
            { id: "e3", from: "n3", to: "n4", branch: "true" },
            { id: "e4", from: "n4", to: "n5" },
          ],
          runs: 42,
        },
        {
          workspaceSlug: ws,
          name: "💳 Cobros y Renovaciones",
          status: "activo",
          description:
            "Avisa al cliente 3 días antes de que venza su cuenta y le ofrece renovar; si no responde, envía un recordatorio.",
          nodes: [
            { id: "c1", type: "trigger", label: "Faltan 3 días para vencer", x: 80, y: 80, config: { event: "subscription.expiring", days: 3 } },
            { id: "c2", type: "action", label: "Enviar recordatorio de renovación", x: 80, y: 200, config: { kind: "send_message", channel: "wa", body: "Hola {{nombre}}, tu cuenta vence en 3 días. ¿Te la renuevo? 😊" } },
            { id: "c3", type: "wait", label: "Esperar 2 días", x: 80, y: 320, config: { days: 2 } },
            { id: "c4", type: "cond", label: "¿Ya renovó?", x: 80, y: 420, config: { field: "renewed", equals: "true" } },
            { id: "c5", type: "action", label: "Recordatorio final + oferta", x: 320, y: 520, config: { kind: "send_message", channel: "wa", body: "{{nombre}}, última oportunidad para renovar con el mismo precio. 🙌" } },
          ],
          edges: [
            { id: "ce1", from: "c1", to: "c2" },
            { id: "ce2", from: "c2", to: "c3" },
            { id: "ce3", from: "c3", to: "c4" },
            { id: "ce4", from: "c4", to: "c5", branch: "false" },
          ],
          runs: 17,
        },
        {
          workspaceSlug: ws,
          name: "🛟 Soporte automático",
          status: "activo",
          description:
            "Responde preguntas frecuentes (no me deja entrar, pantalla en uso, cambiar PIN) al instante y escala a un humano si no lo resuelve.",
          nodes: [
            { id: "s1", type: "trigger", label: "Mensaje con 'no funciona' / 'ayuda'", x: 80, y: 80, config: { event: "message.received", contains: ["no funciona", "ayuda", "error", "no me deja"] } },
            { id: "s2", type: "action", label: "Responder FAQ (IA)", x: 80, y: 200, config: { kind: "ai_reply", prompt: "Soporte de cuentas de streaming. Resuelve: pantalla en uso, cambiar PIN, no inicia sesión, país/VPN." } },
            { id: "s3", type: "cond", label: "¿Se resolvió?", x: 80, y: 320, config: { field: "resolved", equals: "true" } },
            { id: "s4", type: "action", label: "Escalar a humano (asignar en Inbox)", x: 320, y: 420, config: { kind: "assign_human" } },
          ],
          edges: [
            { id: "se1", from: "s1", to: "s2" },
            { id: "se2", from: "s2", to: "s3" },
            { id: "se3", from: "s3", to: "s4", branch: "false" },
          ],
          runs: 63,
        },
      ],
    });
  }
}
