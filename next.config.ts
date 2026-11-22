import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origen de Supabase (REST, Storage, Edge Functions) y su Realtime (wss).
let supabaseOrigins = "https://*.supabase.co wss://*.supabase.co";
try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  supabaseOrigins += ` ${url.origin} wss://${url.host}`;
} catch {
  // Sin URL válida: queda el comodín de *.supabase.co.
}

// Next.js App Router inyecta scripts/estilos inline, por eso 'unsafe-inline'.
// 'unsafe-eval' solo en desarrollo (React Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
