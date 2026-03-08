const isWindows = process.platform === 'win32';
const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

/**
 * Content Security Policy configuration
 * 
 * In production, we use nonces for inline scripts for better security.
 * In development, we use 'unsafe-inline' for hot module reloading compatibility.
 * 
 * CSP Violations monitoring:
 * - Sentry is configured to capture CSP violation reports
 * - Add the report-uri directive pointing to Sentry's CSP reporting endpoint
 */

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig = {
  ...(isWindows ? {} : { output: 'standalone' }),
  outputFileTracingRoot: path.join(__dirname, '../..'),
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
    ],
  },
  
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
      },
    ];
  },
  
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self)',
          },
        ],
      },
      {
        // HSTS - always in production
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
        has: [
          {
            type: 'header',
            key: 'x-forwarded-proto',
            value: 'https',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildCSP(),
          },
        ],
      },
    ];
  },
};

/**
 * Build Content Security Policy string
 * 
 * Development: Uses 'unsafe-inline' for HMR compatibility
 * Production: Uses nonces for strict CSP (nonces are injected via middleware)
 */
function buildCSP() {
  const cspParts = [
    "default-src 'self'",
    isProduction 
      ? "script-src 'self' 'nonce-' 'strict-dynamic'" 
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    isProduction 
      ? "style-src 'self' 'nonce-'" 
      : "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.storage",
    "media-src 'self' blob: https://*.supabase.co https://*.supabase.storage",
    "connect-src 'self' https://*.supabase.co https://*.supabase.storage wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  
  // Add Sentry reporting in production
  if (isProduction && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // Extract project ID from DSN
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    const match = dsn.match(/https:\/\/[^@]+@sentry\.io\/(\d+)/);
    if (match) {
      cspParts.push(`report-uri https://sentry.io/api/${match[1]}/security/?sentry_key=xxx`);
    }
  }
  
  return cspParts.join('; ');
}

/**
 * Sentry configuration
 * 
 * Configure via environment variables:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry DSN (Data Source Name)
 * - SENTRY_ENVIRONMENT: Production/development
 * - SENTRY_TRACES_SAMPLE_RATE: Trace sample rate (0-1)
 * - SENTRY_ERROR_SAMPLE_RATE: Error sample rate (0-1)
 */
const sentryConfig = {
  silent: true, // Suppress Sentry loader logs
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Sentry types
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
};

// Export with Sentry wrapper
module.exports = withSentryConfig(nextConfig, sentryConfig);
