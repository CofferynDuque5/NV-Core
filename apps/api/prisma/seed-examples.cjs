/**
 * Seed de ejemplos — crea UN ejemplo en cada módulo (Formulario, Embudo,
 * Secuencia, Automatización) para un workspace, para ver cómo se ven poblados.
 *
 * Uso (dentro del contenedor api):
 *   docker compose exec api node prisma/seed-examples.cjs [workspaceSlug]
 * Si no pasas slug, usa INBOUND_WORKSPACE o "nv-streaming".
 *
 * Es idempotente por nombre: si ya existe un ejemplo con el mismo nombre en ese
 * workspace, no lo duplica.
 */
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("node:crypto");

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

  console.log("Seed de ejemplos completado.");
}

main()
  .catch((err) => {
    console.error("Error sembrando ejemplos:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
