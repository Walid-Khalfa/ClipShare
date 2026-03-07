# Production Readiness Plan - Security Focus

## Executive Summary

Your Clipshare application has a solid foundation but requires security hardening before production. This plan prioritizes critical security issues that must be addressed.

---

## Current Security State Assessment

### ✅ What's Done Well
1. **Authentication Flow**: Email magic link implementation with session cookies
2. **Password-less Auth**: No password storage risks
3. **Cookie Security**: `httpOnly: true`, `secure` flag in production mode
4. **HTTP Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection configured in Next.js
5. **Input Validation**: Zod schemas on API routes
6. **Database**: Prisma ORM with parameterized queries (injection safe)
7. **File Storage**: S3 with presigned URLs (no direct bucket exposure)

### ❌ Critical Security Issues

| Priority | Issue | Location | Risk |
|----------|-------|----------|------|
| 🔴 Critical | Hardcoded JWT Secret | [`apps/api/src/index.ts:22`](apps/api/src/index.ts:22) | Account takeover |
| 🔴 Critical | No Rate Limiting | Auth endpoints | Brute force attacks |
| 🔴 Critical | No CSRF Protection | All state-changing endpoints | Cross-site request forgery |
| 🔴 Critical | Magic Link Token 15min but Session 30 days | [`apps/api/src/routes/auth.ts:21`](apps/api/src/routes/auth.ts:21) | Token validity mismatch |
| 🟠 High | Hardcoded Redis Connection | [`apps/api/src/routes/upload.ts:27-29`](apps/api/src/routes/upload.ts:27-29) | Connection failure in production |
| 🟠 High | No Session Refresh Mechanism | [`apps/api/src/routes/auth.ts:69`](apps/api/src/routes/auth.ts:69) | Long-lived sessions without renewal |
| 🟠 High | No Input Sanitization | Recording titles | XSS potential |
| 🟡 Medium | No HTTPS Enforcement | Production config | Man-in-the-middle |
| 🟡 Medium | Magic Link Logged to Console | [`apps/api/src/routes/auth.ts:34`](apps/api/src/routes/auth.ts:34) | Information disclosure |
| 🟡 Medium | No Request Size Limits | API server config | DoS attacks |

---

## Recommended Security Hardening Tasks

### Phase 1: Critical Security (Must Fix Before Launch)

#### 1.1 Environment & Secrets
- [ ] **Create production environment files** for each service:
  - [`apps/api/.env.production`](apps/api/.env.production)
  - [`apps/web/.env.production`](apps/web/.env.production)
  - [`apps/worker/.env.production`](apps/worker/.env.production)
- [ ] **Generate strong JWT_SECRET** (minimum 256-bit random string)
- [ ] **Remove hardcoded secrets** from Docker Compose
- [ ] **Use Docker secrets** or environment variable injection in production

#### 1.2 Rate Limiting
- [ ] **Add rate limiting to auth endpoints** (`/auth/magic-link`)
  - Max 5 requests per IP per hour
  - Implement using `@fastify/rate-limit`
- [ ] **Add rate limiting to upload endpoints**
- [ ] **Add general API rate limiting** (100 req/min per IP)

#### 1.3 CSRF Protection
- [ ] **Implement CSRF tokens** for state-changing operations
- [ ] **Add `@fastify/csrf-protection` plugin**
- [ ] **Validate CSRF tokens** on POST/PUT/DELETE requests

#### 1.4 Session Security
- [ ] **Implement session refresh mechanism**
  - Refresh token valid for 7 days
  - Access token valid for 1 hour
  - Auto-refresh on API calls
- [ ] **Add session invalidation on password change** (not applicable for magic link)
- [ ] **Implement session enumeration protection** (don't reveal if email exists)

#### 1.5 Redis Configuration
- [ ] **Fix hardcoded Redis connection** in [`apps/api/src/routes/upload.ts:27`](apps/api/src/routes/upload.ts:27)
- [ ] **Use environment variable**: `REDIS_URL`
- [ ] **Add Redis connection pooling** for production load

---

### Phase 2: Input Validation & Output Encoding

#### 2.1 Request Validation
- [ ] **Add request size limits** to Fastify server
- [ ] **Validate all URL parameters** (recording IDs, tokens)
- [ ] **Sanitize user inputs** (recording titles, descriptions)

#### 2.2 XSS Prevention
- [ ] **Sanitize recording titles** before storage
- [ ] **Ensure safe HTML rendering** in React components
- [ ] **Add Content-Security-Policy header**

#### 2.3 SQL Injection (Already Safe)
- [ ] Prisma ORM handles this - no action needed

---

### Phase 3: Infrastructure Security

#### 3.1 HTTPS/TLS
- [ ] **Configure TLS termination** (reverse proxy or load balancer)
- [ ] **Set `secure: true`** for all cookies in production
- [ ] **Add HSTS header** (HTTP Strict Transport Security)

#### 3.2 CORS Configuration
- [ ] **Restrict CORS to specific domain** in production
- [ ] **Remove wildcard origins**
- [ ] **Validate Origin header**

#### 3.3 API Security
- [ ] **Add request timeout** (30 seconds max)
- [ ] **Implement graceful shutdown** for all services
- [ ] **Add proper error handling** (don't leak stack traces)

---

### Phase 4: Monitoring & Incident Response

#### 4.1 Logging
- [ ] **Structured JSON logging** for production
- [ ] **Log authentication attempts** (success/failure)
- [ ] **Log file operations** (upload, processing)
- [ ] **Mask sensitive data** in logs (tokens, emails partially)

#### 4.2 Monitoring
- [ ] **Add health check endpoints**:
  - `/health` (already exists)
  - `/health/ready` (includes dependencies)
  - `/health/live` (process alive)
- [ ] **Add metrics collection** (request duration, error rates)
- [ ] **Set up alerting** for:
  - High error rates
  - Auth failures
  - Processing failures

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY IMPLEMENTATION ORDER                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1 (Week 1)                                               │
│  ├── 1.1 Environment & Secrets    ████████████████████ 100%    │
│  ├── 1.2 Rate Limiting            ████████████████████ 100%    │
│  ├── 1.3 CSRF Protection          ████████████████████ 100%    │
│  ├── 1.4 Session Security         ████████████████████ 100%    │
│  └── 1.5 Redis Configuration      ████████████████████ 100%    │
│                                                                  │
│  PHASE 2 (Week 2)                                               │
│  ├── 2.1 Request Validation       ████████████████████ 100%    │
│  ├── 2.2 XSS Prevention           ████████████████████ 100%    │
│  └── 2.3 SQL Injection            (Already safe)               │
│                                                                  │
│  PHASE 3 (Week 3)                                               │
│  ├── 3.1 HTTPS/TLS                 ████████████████████ 100%    │
│  ├── 3.2 CORS Configuration        ████████████████████ 100%    │
│  └── 3.3 API Security              ████████████████████ 100%    │
│                                                                  │
│  PHASE 4 (Ongoing)                                              │
│  ├── 4.1 Logging                   ████████████████████ 100%    │
│  └── 4.2 Monitoring                ████████████████████ 100%    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files
- `apps/api/.env.production` - Production environment template
- `apps/web/.env.production` - Production environment template
- `apps/worker/.env.production` - Production environment template
- `.env.production.example` - Complete production env example

### Modified Files
| File | Changes |
|------|---------|
| [`apps/api/src/index.ts`](apps/api/src/index.ts) | Rate limiting, CSRF, request size limits |
| [`apps/api/src/routes/auth.ts`](apps/api/src/routes/auth.ts) | Session refresh, rate limiting, log sanitization |
| [`apps/api/src/routes/upload.ts`](apps/api/src/routes/upload.ts) | Redis env variable |
| [`apps/api/Dockerfile`](apps/api/Dockerfile) | Non-root user (already done) |
| [`apps/web/next.config.js`](apps/web/next.config.js) | CSP headers |
| [`docker-compose.yml`](docker-compose.yml) | Production overrides |

---

## Next Steps

1. **Approve this plan** - Confirm you want to proceed with security hardening
2. **Start Phase 1** - We'll begin with environment/secrets and rate limiting
3. **Test incrementally** - Each change should be tested before proceeding

Would you like me to:
- **A)** Start implementing Phase 1 immediately?
- **B)** Add reliability/monitoring items to this plan?
- **C)** Adjust the scope of any specific item?

---

*Plan created: 2026-03-06*
*Last updated: 2026-03-06*
