import type { NextConfig } from "next";

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Removed 'unsafe-eval' — not required by Next.js or Tailwind
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`,
              "frame-src https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              `connect-src 'self' ${pbUrl} https://challenges.cloudflare.com`,
              "font-src 'self'",
            ].join("; "),
          },
          // Additional security headers
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
