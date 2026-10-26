import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { FormsService } from "./forms.module";
import { AnalyticsService } from "../analytics/analytics.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Origen del lead contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const audit = { record: async () => undefined };
  const plans = { assertWithinLimit: async () => undefined };
  const forms = new FormsService(prisma as never, audit as never, plans as never);
  const analytics = new AnalyticsService(prisma as never);

  it("guarda el primer origen, no lo pisa y solo acepta embudos del mismo workspace", async () => {
    const ws = `it-attr-${Date.now()}`;
    const form = await prisma.form.create({ data: { workspaceSlug: ws, name: "Kit verde" } });
    const funnel = await prisma.funnel.create({ data: { workspaceSlug: ws, name: "Lanzamiento" } });
    const foreign = await prisma.funnel.create({ data: { workspaceSlug: `${ws}-otro`, name: "Ajeno" } });

    await forms.submit(form.id, { name: "Ana", email: "ana@x.com" }, {
      utmSource: "Instagram",
      utmCampaign: "kit-oct",
      landingUrl: "https://pulso.pe/kit?email=ana@x.com",
      funnelId: funnel.id,
    });
    await forms.submit(form.id, { name: "Ana", email: "ANA@x.com" }, { utmSource: "google" });
    await forms.submit(form.id, { name: "Luis", email: "luis@x.com" }, { funnelId: foreign.id });

    const ana = await prisma.contact.findFirst({ where: { workspaceSlug: ws, email: "ana@x.com" } });
    expect(ana!.attribution).toMatchObject({
      source: "instagram",
      campaign: "kit-oct",
      landingUrl: "https://pulso.pe/kit",
      via: "funnel",
      funnelName: "Lanzamiento",
      formName: "Kit verde",
    });
    const luis = await prisma.contact.findFirst({ where: { workspaceSlug: ws, email: "luis@x.com" } });
    expect(luis!.attribution).toMatchObject({ source: "directo", via: "form" });
    expect((luis!.attribution as Record<string, unknown>).funnelId).toBeUndefined();

    await prisma.contact.create({ data: { workspaceSlug: ws, name: "Manual" } });
    const snap = (await analytics.snapshot(ws, 7))!;
    expect(snap.leadSources).toEqual([
      // Ties are ordered by name so the panel doesn't reshuffle.
      { source: "directo", count: 1 },
      { source: "instagram", count: 1 },
      { source: null, count: 1 },
    ]);
  });
});
