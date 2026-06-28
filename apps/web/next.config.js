/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mcpfind/shared"],
  // Ensure blog MDX content and @vercel/og wasm files are bundled into
  // the opengraph-image serverless function. Without this, Next.js file
  // tracing misses dynamically-read files and the wasm assets, causing
  // "failed to pipe res" 500s on Vercel.
  outputFileTracingIncludes: {
    '/blog/[slug]/opengraph-image': [
      './content/blog/**/*.mdx',
      './node_modules/.pnpm/**/next/dist/compiled/@vercel/og/*.wasm',
      './node_modules/.pnpm/**/next/dist/compiled/@vercel/og/*.ttf',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/categories/crm',
        destination: '/servers',
        permanent: true,
      },
      {
        source: '/categories/maps',
        destination: '/servers',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Reporting API endpoint name (modern browsers)
          { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
          // Report-Only CSP — NOT enforcing. Review violation reports before switching to
          // Content-Security-Policy. Built from audited third parties (GTM, GA4, Clarity).
          // report-to  → Reporting API (modern browsers, uses Reporting-Endpoints above)
          // report-uri → legacy fallback for older browsers
          {
            key: 'Content-Security-Policy-Report-Only',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.clarity.ms; connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://*.clarity.ms; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self'; frame-ancestors 'none'; report-to csp-endpoint; report-uri /api/csp-report",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
