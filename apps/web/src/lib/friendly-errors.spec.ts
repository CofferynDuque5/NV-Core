import { describe, expect, it } from "vitest";
import { explainError, simplifyNotice, summarizeSkips } from "@nv/domain";

describe("friendly errors", () => {
  it("explains the Telegram 'input entity' error in plain words", () => {
    const f = explainError(
      'Could not find the input entity for {"channelId":"1552260050","className":"PeerChannel"}. Please read https://docs.telethon.dev',
    );
    expect(f.title).toMatch(/ya no está en tu Telegram/);
    expect(f.hint).toMatch(/Sincronizar/);
  });

  it("explains WhatsApp disconnections and rate limits", () => {
    expect(explainError("not-authorized").title).toMatch(/desconectó/);
    expect(explainError("rate-overlimit").title).toMatch(/demasiados mensajes/);
    expect(explainError("algo raro").title).toMatch(/inesperado/);
  });

  it("summarises skipped groups by reason", () => {
    const why = "El mensaje usa {{precio}} y no sabemos de qué país es: indica el país del grupo.";
    expect(summarizeSkips([{ reason: why }, { reason: why }, { reason: "Apartado: nunca se publica aquí." }])).toBe(
      "Se saltaron 2 grupos porque no tienen país y el mensaje usa {{precio}} (indícalo en Grupos); 1 grupo porque están apartados.",
    );
  });

  it("rewrites an old technical alert", () => {
    const old =
      '46 de 59 enviados. Motivo (MUNDO STREAMING PERÚ): Could not find the input entity for {"channelId":"1552260050","className":"PeerChannel"}. Please read https://docs.telethon.dev/en/stable/concepts/enti 52 grupos omitidos: Ventas valencia (El mensaje usa {{precio}} y no sabemos de qué país es: indica el país del grupo.); Ventas Ciudad Bolivar (El mensaje usa {{precio}} y no sabemos de qué país es: indica el país del grupo.)…. Detalle en Historial.';
    const out = simplifyNotice(old);
    expect(out).not.toMatch(/Could not find|telethon|channelId/);
    expect(out).toMatch(/En «MUNDO STREAMING PERÚ»: Ese grupo ya no está en tu Telegram/);
    expect(out).toMatch(/52 grupos se saltaron, por ejemplo porque no tienen país/);
  });
});
