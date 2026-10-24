import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // Stories have no character limit, so a single save can be large.
    serverActions: { bodySizeLimit: "25mb" },
    // The proxy buffers request bodies; keep it above the action and upload limits.
    proxyClientMaxBodySize: "30mb",
  },
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["bcryptjs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
