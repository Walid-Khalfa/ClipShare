# Clipshare

A Loom-like web application for recording screen + camera + mic, then uploading, processing, and sharing videos with a link.

## Features

- **Recording**: Screen capture with optional microphone and camera bubble overlay
- **Upload**: Direct upload to Supabase Storage with presigned URLs
- **Processing**: Video processing handled by Supabase (or client-side for MVP)
- **Sharing**: Public-by-link sharing with view analytics
- **Authentication**: Email magic link authentication via Supabase

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Supabase account (free tier works)

### Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to Project Settings > API to get your credentials
3. Run the database migrations:
   ```bash
   # Using Supabase CLI
   supabase db push
   ```
4. Create a storage bucket named `recordings`

### Environment Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Fill in your Supabase credentials in `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Development

1. Install dependencies:
```bash
pnpm install
```

2. Run the web application:
```bash
pnpm dev
```

3. Access the application at http://localhost:3000

### Production Deployment (Vercel)

1. Deploy to Vercel:
```bash
pnpm build
vercel deploy --prod
```

2. Set environment variables in Vercel dashboard

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Next.js   │────▶│    Next.js  │
│  (Recording)│     │  Frontend  │     │ API Routes  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                          │                    │
                          ▼                    ▼
                   ┌─────────────┐     ┌─────────────┐
                   │   Supabase  │     │   Supabase  │
                   │   Storage   │     │  Database   │
                   └─────────────┘     └─────────────┘
```

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage
- **Auth**: Supabase Auth (email magic link)

## Browser Support

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Screen recording | ✅ | ✅ | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ |
| Camera overlay | ✅ | ⚠️ | ✅ |

## API Endpoints

All API routes are under `/api/*`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/magic-link | Send magic link |
| POST | /api/recordings | Create recording |
| GET | /api/recordings | List recordings |
| PATCH | /api/recordings | Update recording |
| DELETE | /api/recordings | Delete recording |
| POST | /api/upload?action=initiate | Start upload |
| POST | /api/upload?action=complete | Complete upload |
| POST | /api/upload?action=abort | Abort upload |
| POST | /api/share | Create share link |
| DELETE | /api/share | Revoke share link |
| GET | /api/share?token=xxx | Get shared recording |

## Security Features

- ✅ Row Level Security (RLS) on all database tables
- ✅ Presigned URLs for secure uploads
- ✅ HTTP-only secure cookies for sessions
- ✅ Rate limiting on all API endpoints (5 req/hour for auth, 100 req/min for general)
- ✅ CSRF protection via Origin header validation
- ✅ Input sanitization to prevent XSS attacks
- ✅ Request body size limits (1MB)
- ✅ Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- ✅ Secure session management (15 min access tokens, 7 day refresh tokens)

## Production Considerations

- [x] Session refresh tokens implemented
- [x] Rate limiting implemented (database-backed, serverless-safe)
- [x] CSRF protection implemented
- [x] Input sanitization implemented
- [x] XSS prevention implemented
- [ ] Add CDN for video delivery (recommended for scale)
- [ ] Add video transcoding for multiple quality levels (future)
- [ ] Implement webhooks for processing completion (future)
- [x] Logging and monitoring (via Vercel)

## Testing

Run the test suite:

```bash
# Run all tests
pnpm test

# Run API tests only
cd apps/api && pnpm test

# Run web tests only
cd apps/web && pnpm test
```

## License

MIT
