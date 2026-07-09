/** @type {import('next').NextConfig} */

// Security headers applied to every route. CSP is intentionally pragmatic:
// Next.js (App Router) injects inline bootstrap scripts and inline styles, so
// script/style-src allow 'unsafe-inline' (there is no nonce pipeline here).
// The high-value protections — clickjacking, MIME sniffing, referrer leakage,
// and locking network egress to Supabase — are all enforced strictly.
// Next.js dev mode (HMR/React Refresh) executes eval()'d bundles, so 'unsafe-eval'
// is required locally. Production builds never eval, so it is dropped there.
const dev = process.env.NODE_ENV !== "production";
const scriptSrc = dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Browser talks only to itself and the Supabase project (REST + Realtime WS).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  // Do not fail the Vercel build on lint warnings; TypeScript type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
  // Keep nodemailer external — it uses dynamic requires that shouldn't be bundled.
  experimental: { serverComponentsExternalPackages: ["nodemailer"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
