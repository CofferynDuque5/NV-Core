import type { AutomationEdge, AutomationNode, CreateAutomationInput } from "@nv/domain";

import { autoLayout } from "./workflow";

/**
 * Ready-made flows built only from steps the built-in engine runs
 * (AutomationRunner): incoming message or a contact gone quiet → AI reply /
 * message / contact / team notice / hand-off, with waits and the conditions
 * it fills in.
 * They are created paused, so nothing is sent until someone reviews and
 * activates them.
 */
export interface AutomationTemplate {
  id: string;
  name: string;
  summary: string;
  /** What has to be connected for it to do anything. */
  needs: string[];
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

const n = (id: string, type: AutomationNode["type"], label: string, config: Record<string, unknown>): AutomationNode => ({
  id,
  type,
  label,
  config,
});
const e = (from: string, to: string, branch?: "true" | "false"): AutomationEdge => ({
  id: `e-${from}-${to}`,
  from,
  to,
  ...(branch ? { branch } : {}),
});

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "bienvenida",
    name: "Bienvenida a quien escribe por primera vez",
    summary: "Guarda a cada persona nueva como contacto, le da la bienvenida una sola vez y avisa al equipo.",
    needs: ["WhatsApp o Telegram conectado"],
    nodes: [
      n("t", "trigger", "Llega un mensaje", { event: "message.received" }),
      n("c", "action", "Crear contacto (Lead)", { action: "create-contact", stage: "Lead", tag: "nuevo" }),
      n("q", "cond", "Es un contacto nuevo", { field: "newContact=true" }),
      n("m", "action", "Mensaje de bienvenida", {
        action: "send-message",
        body: "¡Hola {{nombre}}! Gracias por escribirnos. En un momento te atendemos.",
      }),
      n("a", "action", "Avisar al equipo", { action: "notify", title: "Nuevo contacto por mensaje" }),
    ],
    edges: [e("t", "c"), e("c", "q"), e("q", "m", "true"), e("m", "a")],
  },
  {
    id: "ventas-ia",
    name: "Atención de ventas con IA",
    summary: "Cuando preguntan por precios, la IA responde; si quieren comprar, crea el contacto y te avisa.",
    needs: ["WhatsApp o Telegram conectado", "IA configurada"],
    nodes: [
      n("t", "trigger", "Mensaje sobre precios", { event: "message.received", contains: "precio, cuánto, cuanto, comprar, info" }),
      n("r", "action", "Responder con IA", {
        action: "ai-reply",
        prompt: "Eres el asistente de ventas de la marca. Responde con amabilidad, da la información que tengas y no inventes precios.",
      }),
      n("q", "cond", "Quiere comprar", { field: "intent=compra" }),
      n("c", "action", "Crear contacto (interesado)", { action: "create-contact", stage: "Lead", tag: "interesado" }),
      n("a", "action", "Avisar para cerrar la venta", { action: "notify", title: "Interesado en comprar" }),
    ],
    edges: [e("t", "r"), e("r", "q"), e("q", "c", "true"), e("c", "a")],
  },
  {
    id: "soporte",
    name: "Soporte con paso a una persona",
    summary: "La IA atiende los problemas; si no lo resuelve, la conversación pasa a alguien del equipo.",
    needs: ["WhatsApp o Telegram conectado", "IA configurada"],
    nodes: [
      n("t", "trigger", "Mensaje pidiendo ayuda", {
        event: "message.received",
        contains: "ayuda, no funciona, error, problema, no puedo",
      }),
      n("r", "action", "Responder con IA", {
        action: "ai-reply",
        prompt: "Eres soporte de la marca. Da pasos claros; si no sabes la respuesta, ofrece pasar con una persona.",
      }),
      n("q", "cond", "La IA lo resolvió", { field: "resolved=true" }),
      n("h", "action", "Pasar a una persona", { action: "assign-human" }),
    ],
    edges: [e("t", "r"), e("r", "q"), e("q", "h", "false")],
  },
  {
    id: "seguimiento",
    name: "Seguimiento al día siguiente",
    summary: "Responde al momento a quien pregunta por precios y vuelve a escribirle 24 horas después.",
    needs: ["WhatsApp o Telegram conectado"],
    nodes: [
      n("t", "trigger", "Mensaje sobre precios", { event: "message.received", contains: "precio, cuánto, cuanto, info" }),
      n("m", "action", "Respuesta inmediata", {
        action: "send-message",
        body: "¡Hola {{nombre}}! Recibimos tu consulta y te respondemos enseguida.",
      }),
      n("w", "wait", "Esperar 1 día", { duration: "1d" }),
      n("f", "action", "Mensaje de seguimiento", {
        action: "send-message",
        body: "Hola {{nombre}}, ¿pudiste ver la información? Si tienes dudas, aquí estamos.",
      }),
    ],
    edges: [e("t", "m"), e("m", "w"), e("w", "f")],
  },
  {
    id: "reactivar",
    name: "Reactivar a quien dejó de escribir",
    summary: "A los 30 días sin noticias de un contacto le escribe para retomar la conversación y avisa al equipo.",
    needs: ["WhatsApp conectado"],
    nodes: [
      n("t", "trigger", "30 días sin escribir", { event: "contact.inactive", days: "30" }),
      n("m", "action", "Mensaje para retomar", {
        action: "send-message",
        body: "¡Hola {{nombre}}! Hace tiempo no hablamos. ¿Te podemos ayudar con algo? Responde BAJA si no quieres más mensajes.",
      }),
      n("a", "action", "Avisar al equipo", { action: "notify", title: "Contacto inactivo contactado" }),
    ],
    edges: [e("t", "m"), e("m", "a")],
  },
];

/**
 * Stack the steps top to bottom in run order. Templates are single chains, and
 * the editor's left-to-right layout would push the 4th–5th step off a laptop
 * screen; a column fits any width.
 */
export function stackLayout(nodes: AutomationNode[], edges: AutomationEdge[]): AutomationNode[] {
  const depth = new Map(autoLayout({ nodes, edges }).nodes.map((n) => [n.id, n.x ?? 0]));
  const order = [...nodes].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  const row = new Map(order.map((n, i) => [n.id, i]));
  return nodes.map((n) => ({ ...n, x: STACK_X, y: STACK_Y + (row.get(n.id) ?? 0) * STACK_ROW }));
}
const STACK_X = 60;
const STACK_Y = 40;
const STACK_ROW = 116;

/** The create payload for a template: laid out, paused, ready to review. */
export function templateToInput(t: AutomationTemplate): CreateAutomationInput {
  const graph = { nodes: stackLayout(t.nodes, t.edges), edges: t.edges };
  return {
    name: t.name,
    description: t.summary,
    status: "pausado",
    nodes: graph.nodes,
    edges: graph.edges,
  };
}
