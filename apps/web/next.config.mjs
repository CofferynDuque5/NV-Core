const isStaticExport = process.env.STATIC_EXPORT === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared domain package straight from source.
  transpilePackages: ["@nv/domain"],
  // Static export (`STATIC_EXPORT=true pnpm build`) for previewing without a
  // Node server (e.g. Live Server). The normal build/dev is unaffected.
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
