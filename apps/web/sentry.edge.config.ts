import * as Sentry from '@sentry/nextjs';

/**
 * Sentry edge runtime configuration
 */
export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || 
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA,
    });
  }
}
