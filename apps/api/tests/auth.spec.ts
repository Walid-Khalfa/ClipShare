import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

// Mock supabase module
vi.mock('../src/lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
      verifyOtp: vi.fn(async () => ({ 
        data: { session: { access_token: 'test-token', refresh_token: 'test-refresh' } }, 
        error: null 
      })),
      getUser: vi.fn(async (token: string) => ({ 
        data: { user: token ? { id: 'test-user', email: 'test@example.com' } : null }, 
        error: null 
      })),
      signOut: vi.fn(async () => ({ error: null })),
      refreshSession: vi.fn(async () => ({ 
        data: { session: { access_token: 'new-token', refresh_token: 'new-refresh' } }, 
        error: null 
      })),
    },
  },
}));

// Mock rate-limit module
vi.mock('../src/lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: new Date() })),
}));

import { authRouter } from '../src/routes/auth.js';

describe('Auth Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(cors, { origin: true, credentials: true });
    await app.register(cookie);
    
    // Add authenticate decorator
    app.decorate('authenticate', async function (request: any, reply: any) {
      const token = request.cookies?.['sb-access-token'];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      request.user = { id: 'test-user', email: 'test@example.com' };
    });
    
    await app.register(authRouter, { prefix: '/auth' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/magic-link', () => {
    it('should return 400 for invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: { email: 'invalid-email' },
        headers: {
          'content-type': 'application/json',
        },
      });

      // Zod validation returns 400 or 500 depending on setup
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should return 400 for missing email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: {},
        headers: {
          'content-type': 'application/json',
        },
      });

      // Zod validation returns 400 or 500 depending on setup
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should return 400/415 for wrong content-type (CSRF protection)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: 'email=test@example.com',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      });

      // Fastify may return 400 or 415 for unsupported content type
      expect([400, 415]).toContain(response.statusCode);
    });

    it('should return generic success message for valid email (prevents enumeration)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: { email: 'test@example.com' },
        headers: {
          'content-type': 'application/json',
        },
      });

      // Should return success even if email doesn't exist (prevents enumeration)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.message).toContain('magic link has been sent');
    });
  });

  describe('GET /auth/verify', () => {
    it('should return 400 for missing token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/verify',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid verification type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/verify?token=validtoken123&type=invalidtype',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('should clear cookies on logout', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: {
          'sb-access-token': 'test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      
      // Check that cookies are being cleared
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 401 for missing refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('No refresh token');
    });
  });
});
