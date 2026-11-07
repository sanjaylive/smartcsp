import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = (process.env.API_URL ?? 'http://localhost:4610').replace(/\/$/, '');
/** Build-time mount point, e.g. '/admin' when served under the tenant domain. Empty in dev/tests. */
const BASE_PATH = (process.env.ADMIN_BASE_PATH ?? '').replace(/\/$/, '');

/**
 * Static security headers. The Content-Security-Policy (with a per-request script nonce) is set
 * in src/middleware.ts so that Next.js can attach the nonce to its own inline scripts.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (infra/docker/next.Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [],
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  async rewrites() {
    // Same-origin proxy: the admin session cookie (httpOnly, SameSite=Strict) stays first-party.
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
