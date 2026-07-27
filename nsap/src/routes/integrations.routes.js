import { Router } from "express";

import { aiConfigured, selectProvider } from "../ai.js";
import { n8nConfigured } from "../n8n.js";

export const integrationsRouter = Router();

/**
 * Estado de las integraciones, derivado de variables de entorno (sin exponer
 * secretos). Guía cada tarjeta del panel "Conexiones".
 */
integrationsRouter.get("/status", (_req, res) => {
  const fbConfigured = Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
  const igConfigured = Boolean(process.env.IG_BUSINESS_ID && (process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN));
  res.json({
    ai: { configured: aiConfigured(), provider: selectProvider() },
    n8n: { configured: n8nConfigured() },
    facebook: {
      configured: fbConfigured,
      needs: ["META_APP_ID", "META_APP_SECRET", "FB_PAGE_ID", "FB_PAGE_TOKEN"],
    },
    instagram: {
      configured: igConfigured,
      needs: ["IG_BUSINESS_ID", "IG_ACCESS_TOKEN (o FB_PAGE_TOKEN)"],
    },
  });
});
