import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite config — React SPA.
 *
 * The app is a pure client-side SPA that talks to the NestJS backend over REST
 * + Socket.IO. `build` emits a static `dist/` folder ready to be served by
 * Nginx or Apache. No SSR, no server runtime.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Consume the shared domain package straight from source (like Next's
      // transpilePackages), avoiding CommonJS interop with its dist build.
      "@nv/domain": fileURLToPath(new URL("../../packages/domain/src/index.ts", import.meta.url)),
    },
  },
  server: {
    // WEB_PORT lets the launcher (scripts/arrancar.mjs) pick a free port and
    // fail loudly (strictPort) instead of silently sliding to another one.
    port: Number(process.env.WEB_PORT) || 3000,
    strictPort: true,
    host: true,
  },
  preview: {
    port: Number(process.env.WEB_PORT) || 3000,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Split heavy vendors so the initial payload stays small (low-resource VPS).
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
