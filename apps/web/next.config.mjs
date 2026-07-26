import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isStaticExport = process.env.STATIC_EXPORT === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared domain package straight from source.
  transpilePackages: ["@nv/domain"],
  // Trace workspace files so the standalone output includes @nv/domain.
  outputFileTracingRoot: join(__dirname, "../../"),
  ...(isStaticExport
    ? {
        // Static export (`STATIC_EXPORT=true pnpm build`) for previewing without
        // a Node server (e.g. Live Server).
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // Slim, self-contained server bundle for Docker.
        output: "standalone",
      }),
};

export default nextConfig;
