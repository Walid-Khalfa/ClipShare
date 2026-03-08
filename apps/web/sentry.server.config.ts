import * as Sentry from '@sentry/nextjs';
import type { Http } from '@sentry/node';

/**
 * Sentry server-side configuration for Next.js API routes
 */

export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      
      environment: process.env.SENTRY_ENVIRONMENT || 
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA,
      
      // Server-side only integrations
      integrations: [
        Sentry.httpIntegration() as unknown as Http,
      ],
      
      debug: process.env.NODE_ENV === 'development',
    });
  }
}
