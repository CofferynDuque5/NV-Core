import * as React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AppProviders } from "@/providers/app-providers";
import { AppRoutes } from "@/app-routes";
import "@/app/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el elemento #root");

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA: register the service worker so the app is installable. Only in secure
// contexts (production/HTTPS, or localhost in dev). The SW only cache-firsts
// hashed /assets/*, so it never interferes with Vite HMR (dev uses /src, /@vite).
{
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && (import.meta.env.PROD || local)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}
