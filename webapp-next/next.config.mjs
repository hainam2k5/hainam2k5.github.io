/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not fail the Vercel build on lint warnings; TypeScript type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
