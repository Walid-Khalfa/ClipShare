# ClipShare Production Readiness Improvements

This document describes the production-ready configuration for ClipShare.

## 1. CDN for Video Delivery

### Configuration

Set the CDN URL in environment variables:

```bash
NEXT_PUBLIC_CDN_URL=https://cdn.example.com
```

### Supported CDN Options

1. **Supabase Built-in CDN** (default) - Uses Supabase's integrated CDN
2. **CloudFront** - Configure your CloudFront distribution URL
3. **Custom CDN** - Any CDN that can fetch from Supabase Storage

### Caching Strategy

| Content Type | Cache Duration | Cache-Control Header |
|-------------|----------------|---------------------|
| Videos | 1 year | `public, max-age=31536000, immutable` |
| Thumbnails | 1 day | `public, max-age=86400` |
| API Responses | No cache | `no-store, no-cache, must-revalidate` |

### Implementation

The CDN URL is automatically applied in `/api/share/route.ts` when generating video URLs. See `src/lib/cdn.ts` for the implementation.

## 2. Structured Logging (Pino)

### Configuration

```bash
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, fatal
```

### Implementation

- Logger utility: `src/lib/logger.ts`
- All API routes use structured logging with correlation IDs
- In development: Pretty-printed logs with colors
- In production: JSON logs for log aggregation

### Log Format

```json
{
  "level": "info",
  "time": "2024-01-01T00:00:00.000Z",
  "service": "clipshare",
  "environment": "production",
  "correlationId": "corr_1234567890_abc123",
  "http": {
    "method": "GET",
    "url": "/api/share?token=xxx",
    "statusCode": 200,
    "duration_ms": 45
  },
  "userId": "user_123"
}
```

## 3. Error Tracking (Sentry)

### Configuration

```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_ERROR_SAMPLE_RATE=1.0
```

### Features

- **Error capture**: All unhandled exceptions and rejected promises
- **Performance monitoring**: Automatic transaction tracing
- **User context**: User ID and email attached to events
- **Source maps**: Automatically uploaded for better stack traces
- **Session replay**: Optional session replay integration

### Files

- Client config: `sentry.client.config.ts`
- Server config: `sentry.server.config.ts`
- Edge config: `sentry.edge.config.ts`

## 4. Rate Limit Cleanup

### Configuration

The cleanup job removes expired rate limit records from the database.

**Run manually:**
```bash
pnpm --filter @clipshare/api run cleanup:rate-limits
```

**Schedule via cron (daily at 2 AM UTC):**
```
0 2 * * * cd /path/to/project && pnpm --filter @clipshare/api run cleanup:rate-limits
```

### Retention Policy

- Records older than 2x the window duration are deleted
- OR records older than 1 day (whichever comes first)

### Alternative: Supabase Edge Function

If using Supabase Edge Functions, create a function that calls `cleanup_expired_rate_limits()` and configure a cron schedule.

## 5. Content Security Policy (CSP)

### Configuration

The CSP is configured in `next.config.js` and enhanced with nonces via middleware.

**Development:**
- Uses `'unsafe-inline'` for hot module reloading compatibility

**Production:**
- Uses nonces for strict CSP
- Middleware injects unique nonce per request
- Monitors violations via Sentry

### CSP Directives

```
default-src 'self';
script-src 'self' 'nonce-{generated}' 'strict-dynamic';
style-src 'self' 'nonce-{generated}';
img-src 'self' data: blob: https://*.supabase.co https://*.supabase.storage;
media-src 'self' blob: https://*.supabase.co https://*.supabase.storage;
connect-src 'self' https://*.supabase.co https://*.supabase.storage wss://*.supabase.co;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

### Monitoring CSP Violations

In production, CSP violations are reported to Sentry via the `report-uri` directive.

## Environment Variables Summary

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_CDN_URL` | CDN URL for video delivery | No |
| `LOG_LEVEL` | Logging level | No |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking | No |
| `SENTRY_ENVIRONMENT` | Sentry environment | No |
| `SENTRY_TRACES_SAMPLE_RATE` | Performance sampling rate | No |
| `SENTRY_ERROR_SAMPLE_RATE` | Error sampling rate | No |

## Backward Compatibility

All features are backward compatible:
- CDN: Falls back to Supabase Storage URL if not configured
- Logging: Uses console if logger fails to initialize
- Sentry: Only active if DSN is configured
- Rate limits: Work without cleanup (cleanup prevents table bloat)
- CSP: Falls back to less strict policy if middleware fails
