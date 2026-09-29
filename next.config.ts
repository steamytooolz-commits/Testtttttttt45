import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the PDF engine (large CJS lib with its own bundler assumptions)
  // external to the server bundle.
  serverExternalPackages: ['@react-pdf/renderer'],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [],
  },
  output: 'standalone',
  productionBrowserSourceMaps: false,
  async headers() {
    const scriptSrc =
      process.env.NODE_ENV === 'production'
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://*.google.internal https://ai.studio https://*.run.app;"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://*.google.internal https://ai.studio https://*.run.app;";
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: scriptSrc,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
