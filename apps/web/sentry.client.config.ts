import * as Sentry from '@sentry/nextjs';

/**
 * Sentry configuration for ClipShare
 * Configure DSN via NEXT_PUBLIC_SENTRY_DSN environment variable
 */

export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      
      // Environment
      environment: process.env.SENTRY_ENVIRONMENT || 
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      
      // Sample rates - adjust for production
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      
      // Release tracking
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA,
      
      // Ignore common non-actionable errors
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        /^Network Error$/,
        'Failed to fetch',
      ],
      
      // Filter events
      beforeSend(event, hint) {
        // Add custom filtering logic here if needed
        return event;
      },
      
      // Integration setup
      integrations: [
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
        Sentry.browserTracingIntegration(),
      ],
      
      // Replay configuration
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      
      // Debug mode in development
      debug: process.env.NODE_ENV === 'development',
    });
  }
}
