/**
 * Seed de ejemplos — crea datos de muestra en cada módulo (Formulario, Embudo,
 * Secuencia, Automatización, Contactos, Segmentos, Plantillas y una Campaña
 * borrador) para un workspace, para ver cómo se ven poblados.
 *
 * Uso (desarrollo local):
 *   pnpm seed [workspaceSlug]
 * O directo:  node prisma/seed-examples.cjs [workspaceSlug]
 * Si no pasas slug, usa INBOUND_WORKSPACE o "nv-streaming".
 *
 * Es idempotente por nombre y ADITIVO: nunca borra nada; si ya existe un
 * ejemplo con el mismo nombre en ese workspace, no lo duplica.
 */
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Cargar apps/api/.env si DATABASE_URL no está en el entorno (para poder correr
// el seed con `node prisma/seed-examples.cjs` fuera de Docker).
if (!process.env.DATABASE_URL) {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
}

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] || process.env.INBOUND_WORKSPACE || "nv-streaming";
  console.log(`Sembrando ejemplos en el workspace "${slug}"…`);

  // ── Formulario ──────────────────────────────────────────────────────────────
  const formName = "Formulario de ejemplo — Webinar";
  let form = await prisma.form.findFirst({ where: { workspaceSlug: slug, name: formName } });
  if (!form) {
    form = await prisma.form.create({
      data: {
        workspaceSlug: slug,
        name: formName,
        fields: [
          { key: "name", label: "Nombre", required: true },
          { key: "email", label: "Correo", required: true },
          { key: "phone", label: "WhatsApp", required: false },
        ],
        tags: ["ejemplo", "webinar"],
        stage: "Lead",
        submitLabel: "Quiero mi cupo",
        successMessage: "¡Listo! Te enviaremos el acceso por correo. 🎉",
      },
    });
    console.log("  ✓ Formulario creado");
  } else {
    console.log("  = Formulario ya existía");
  }

  // ── Embudo (opt-in → venta → gracias) ────────────────────────────────────────
  const funnelName = "Embudo de ejemplo — Lanzamiento";
  const existingFunnel = await prisma.funnel.findFirst({
    where: { workspaceSlug: slug, name: funnelName },
  });
  if (!existingFunnel) {
    await prisma.funnel.create({
      data: {
        workspaceSlug: slug,
        name: funnelName,
        steps: [
          {
            id: randomUUID(),
            name: "Opt-in",
            type: "optin",
            formId: form.id,
            headline: "Regístrate gratis al webinar",
            body: "Déjanos tus datos y te enviamos el acceso.",
            views: 0,
          },
          {
            id: randomUUID(),
            name: "Oferta",
            type: "sales",
            headline: "Oferta especial solo hoy",
            body: "Accede al plan completo con 30% de descuento.",
            ctaLabel: "Comprar ahora",
            views: 0,
          },
          {
            id: randomUUID(),
            name: "Gracias",
            type: "thankyou",
            headline: "¡Gracias por tu compra!",
            body: "Revisa tu correo para los siguientes pasos.",
            views: 0,
          },
        ],
      },
    });
    console.log("  ✓ Embudo creado");
  } else {
    console.log("  = Embudo ya existía");
  }

  // ── Secuencia (autoresponder) ────────────────────────────────────────────────
  const seqName = "Secuencia de ejemplo — Bienvenida";
  const existingSeq = await prisma.sequence.findFirst({
    where: { workspaceSlug: slug, name: seqName },
  });
  if (!existingSeq) {
    await prisma.sequence.create({
      data: {
        workspaceSlug: slug,
        name: seqName,
        status: "active",
        steps: [
          {
            id: randomUUID(),
            delayDays: 0,
            channel: "email",
            subject: "¡Bienvenido/a! 👋",
            body: "Gracias por unirte. Aquí tienes tus primeros pasos.",
          },
          {
            id: randomUUID(),
            delayDays: 2,
            channel: "whatsapp",
            body: "¿Tienes dudas? Responde este mensaje y te ayudamos.",
          },
        ],
      },
    });
    console.log("  ✓ Secuencia creada");
  } else {
    console.log("  = Secuencia ya existía");
  }

  // ── Automatización (trigger → condición → 2 ramas) ───────────────────────────
  const autoName = "Automatización de ejemplo — Nuevo lead";
  const existingAuto = await prisma.automation.findFirst({
    where: { workspaceSlug: slug, name: autoName },
  });
  if (!existingAuto) {
    const nTrigger = randomUUID();
    const nCond = randomUUID();
    const nYes = randomUUID();
    const nNo = randomUUID();
    await prisma.automation.create({
      data: {
        workspaceSlug: slug,
        name: autoName,
        status: "pausado",
        description: "Cuando entra un contacto nuevo, decide según su etapa.",
        nodes: [
          { id: nTrigger, type: "trigger", label: "Nuevo contacto", x: 60, y: 60, config: { event: "contact.created" } },
          { id: nCond, type: "cond", label: "¿Es Cliente?", x: 60, y: 180, config: { field: "stage", op: "eq", value: "Cliente" } },
          { id: nYes, type: "action", label: "Mensaje de bienvenida", x: -80, y: 300, config: { kind: "message", channel: "whatsapp", text: "¡Hola! Gracias por tu compra 🎉" } },
          { id: nNo, type: "action", label: "Mensaje de seguimiento", x: 220, y: 300, config: { kind: "message", channel: "whatsapp", text: "¡Hola! ¿Te ayudamos a decidir?" } },
        ],
        edges: [
          { id: randomUUID(), from: nTrigger, to: nCond },
          { id: randomUUID(), from: nCond, to: nYes, branch: "true" },
          { id: randomUUID(), from: nCond, to: nNo, branch: "false" },
        ],
      },
    });
    console.log("  ✓ Automatización creada");
  } else {
    console.log("  = Automatización ya existía");
  }

  // ── Contactos de ejemplo ─────────────────────────────────────────────────────
  const contacts = [
    { name: "María López", phone: "+521555000001", email: "maria@example.com", company: "Café Aurora", stage: "Cliente", tags: ["VIP", "mensual"] },
    { name: "Juan Pérez", phone: "+521555000002", email: "juan@example.com", company: "Tech Nova", stage: "Lead", tags: ["webinar"] },
    { name: "Ana Torres", phone: "+521555000003", email: "ana@example.com", company: "Studio 7", stage: "Cliente", tags: ["anual"] },
    { name: "Carlos Ruiz", phone: "+521555000004", email: "carlos@example.com", company: "Delta SA", stage: "En riesgo", tags: ["soporte"] },
    { name: "Lucía Gómez", phone: "+521555000005", email: "lucia@example.com", company: "Freelance", stage: "Lead", tags: ["instagram"] },
    { name: "Pedro Díaz", phone: "+521555000006", email: "pedro@example.com", company: "Inactivo Corp", stage: "Inactivo", tags: [] },
  ];
  let contactsCreated = 0;
  for (const c of contacts) {
    const exists = await prisma.contact.findFirst({
      where: { workspaceSlug: slug, name: c.name, email: c.email },
    });
    if (!exists) {
      await prisma.contact.create({ data: { workspaceSlug: slug, ...c, lastContactAt: new Date() } });
      contactsCreated++;
    }
  }
  console.log(contactsCreated ? `  ✓ ${contactsCreated} contacto(s) creado(s)` : "  = Contactos ya existían");

  // ── Segmentos de ejemplo ─────────────────────────────────────────────────────
  const segments = [
    { name: "Clientes", color: "#22C55E", match: "all", rules: [{ field: "stage", operator: "equals", value: "Cliente" }] },
    { name: "Leads con WhatsApp", color: "#5B8DEF", match: "all", rules: [
      { field: "stage", operator: "equals", value: "Lead" },
      { field: "phone", operator: "is_set", value: "" },
    ] },
    { name: "VIP", color: "#E1306C", match: "any", rules: [{ field: "tags", operator: "has_tag", value: "VIP" }] },
    { name: "En riesgo / Inactivos", color: "#F59E0B", match: "any", rules: [
      { field: "stage", operator: "equals", value: "En riesgo" },
      { field: "stage", operator: "equals", value: "Inactivo" },
    ] },
  ];
  let segCreated = 0;
  for (const s of segments) {
    const exists = await prisma.segment.findFirst({ where: { workspaceSlug: slug, name: s.name } });
    if (!exists) {
      await prisma.segment.create({ data: { workspaceSlug: slug, ...s } });
      segCreated++;
    }
  }
  console.log(segCreated ? `  ✓ ${segCreated} segmento(s) creado(s)` : "  = Segmentos ya existían");

  // ── Plantillas de mensaje ────────────────────────────────────────────────────
  const templates = [
    { name: "Bienvenida", category: "Onboarding", body: "¡Hola {{grupo}}! Gracias por unirte. Cualquier duda, aquí estamos. 👋" },
    { name: "Promoción", category: "Marketing", body: "🔥 Solo hoy: 30% de descuento en tu suscripción. Responde ESTE mensaje para más info." },
    { name: "Recordatorio de pago", category: "Cobranza", body: "Hola {{grupo}}, te recordamos que tu pago vence el {{fecha}}. ¡Gracias!" },
    { name: "Reactivación", category: "Retención", body: "Te extrañamos 💜 Vuelve hoy y te damos un mes gratis." },
  ];
  let tplCreated = 0;
  for (const t of templates) {
    const exists = await prisma.template.findFirst({ where: { workspaceSlug: slug, name: t.name } });
    if (!exists) {
      await prisma.template.create({ data: { workspaceSlug: slug, ...t } });
      tplCreated++;
    }
  }
  console.log(tplCreated ? `  ✓ ${tplCreated} plantilla(s) creada(s)` : "  = Plantillas ya existían");

  // ── Campaña de ejemplo (borrador — no se envía sola) ─────────────────────────
  const campName = "Campaña de ejemplo — Promo de bienvenida";
  const existingCamp = await prisma.campaign.findFirst({ where: { workspaceSlug: slug, name: campName } });
  if (!existingCamp) {
    await prisma.campaign.create({
      data: {
        workspaceSlug: slug,
        name: campName,
        status: "borrador",
        channels: ["wa"],
        message: "¡Hola {{grupo}}! 🎉 Promo de bienvenida: 30% de descuento esta semana.",
        scheduleType: "once",
        scheduleDays: [],
      },
    });
    console.log("  ✓ Campaña de ejemplo creada (borrador)");
  } else {
    console.log("  = Campaña de ejemplo ya existía");
  }

  console.log("Seed de ejemplos completado.");
}

main()
  .catch((err) => {
    console.error("Error sembrando ejemplos:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
