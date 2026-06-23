/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling these CJS packages — they rely on
  // Node.js fs internals that break when webpack-ised.
  // (Next.js 14 uses experimental.serverComponentsExternalPackages)
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
  // react-markdown and remark-gfm are ESM-only — transpile them for webpack
  transpilePackages: ["react-markdown", "remark-gfm"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};
export default nextConfig;
