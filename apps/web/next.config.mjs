/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared domain package straight from source.
  transpilePackages: ["@nv/domain"],
};

export default nextConfig;
