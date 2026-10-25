import type { NextConfig } from "next";

/**
 * Sent with every page. Most important: no other website may show Writt inside
 * a frame (so nobody can trick the admin into clicking hidden admin buttons),
 * and browsers must use HTTPS and not guess file types.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
