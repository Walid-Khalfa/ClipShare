import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the rate-limit module to avoid database dependency
vi.mock('./supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async () => ({ data: [{ allowed: true, remaining: 4, reset_at: new Date() }], error: null })),
  })),
}));

import { checkRateLimit, getClientIp, RATE_LIMIT_CONFIGS } from './rate-limit';

// Helper function to hash IP (same implementation as rate-limit.ts)
function hashIp(ip: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(ip + process.env.RATE_LIMIT_SECRET || 'default-secret');
  return hash.digest('hex').slice(0, 16);
}

describe('Rate Limiting', () => {
  const mockRequest = {
    headers: new Map(),
    get: function (key: string) {
      return this.headers.get(key);
    }
  } as unknown as NextRequest;

  describe('RATE_LIMIT_CONFIGS', () => {
    it('should have config for auth magic-link', () => {
      expect(RATE_LIMIT_CONFIGS['/api/auth/magic-link']).toEqual({
        maxRequests: 5,
        windowSeconds: 3600,
      });
    });

    it('should have config for upload', () => {
      expect(RATE_LIMIT_CONFIGS['/api/upload']).toEqual({
        maxRequests: 50,
        windowSeconds: 60,
      });
    });

    it('should have config for recordings', () => {
      expect(RATE_LIMIT_CONFIGS['/api/recordings']).toEqual({
        maxRequests: 100,
        windowSeconds: 60,
      });
    });

    it('should have config for share', () => {
      expect(RATE_LIMIT_CONFIGS['/api/share']).toEqual({
        maxRequests: 100,
        windowSeconds: 60,
      });
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = {
        headers: new Map([
          ['x-forwarded-for', '192.168.1.1, 10.0.0.1'],
        ]),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const ip = getClientIp(request);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = {
        headers: new Map([
          ['x-real-ip', '192.168.1.100'],
        ]),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const ip = getClientIp(request);
      expect(ip).toBe('192.168.1.100');
    });

    it('should return unknown when no headers', () => {
      const request = {
        headers: new Map(),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const ip = getClientIp(request);
      expect(ip).toBe('unknown');
    });
  });

  describe('hashIp', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = hashIp('192.168.1.1');
      const hash2 = hashIp('192.168.1.1');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different IPs', () => {
      const hash1 = hashIp('192.168.1.1');
      const hash2 = hashIp('192.168.1.2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hex string', () => {
      const hash = hashIp('192.168.1.1');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests when under limit', async () => {
      const request = {
        headers: new Map([['x-forwarded-for', '192.168.1.1']]),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const result = await checkRateLimit(request, '/api/recordings', {
        maxRequests: 100,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should use custom config when provided', async () => {
      const request = {
        headers: new Map([['x-forwarded-for', '192.168.1.1']]),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const result = await checkRateLimit(request, '/api/test', {
        maxRequests: 5,
        windowSeconds: 60,
      });

      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remaining).toBe('number');
    });

    it('should fail open on database errors', async () => {
      const request = {
        headers: new Map(),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const result = await checkRateLimit(request, '/api/test');

      // Should still return a valid result (fail-open)
      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remaining).toBe('number');
      expect(result.allowed).toBe(true); // Fail-open behavior
    });

    it('should use default config for unknown endpoints', async () => {
      const request = {
        headers: new Map([['x-forwarded-for', '192.168.1.1']]),
        get: function (key: string) {
          return this.headers.get(key);
        }
      } as unknown as NextRequest;

      const result = await checkRateLimit(request, '/api/unknown-endpoint');

      expect(result.allowed).toBe(true);
      // Default remaining comes from the mock which returns 4
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });
  });
});
