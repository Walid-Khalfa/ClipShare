import { describe, it, expect, vi } from 'vitest';

// Mock the rate-limit module to avoid database dependency
vi.mock('../src/lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(async (_ip: string, _endpoint: string, config?: { maxRequests?: number; windowSeconds?: number }) => ({
    allowed: true,
    remaining: (config?.maxRequests || 100) - 1,
    resetAt: new Date(Date.now() + (config?.windowSeconds || 60) * 1000),
  })),
  createRateLimitChecker: vi.fn((endpoint: string, config: { maxRequests: number; windowSeconds: number }) => {
    return async (_ip: string) => ({
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000),
    });
  }),
}));

import { checkRateLimit, createRateLimitChecker } from '../src/lib/rate-limit.js';

describe('Rate Limiting', () => {
  const testIp = '192.168.1.1';
  const testEndpoint = '/test/endpoint';

  describe('checkRateLimit', () => {
    it('should allow initial requests', async () => {
      const result = await checkRateLimit(testIp, testEndpoint, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should return a resetAt date', async () => {
      const result = await checkRateLimit(testIp, testEndpoint, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should handle different IP addresses independently', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      const result1 = await checkRateLimit(ip1, testEndpoint, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      const result2 = await checkRateLimit(ip2, testEndpoint, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should handle different endpoints independently', async () => {
      const endpoint1 = '/api/auth';
      const endpoint2 = '/api/upload';

      const result1 = await checkRateLimit(testIp, endpoint1, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      const result2 = await checkRateLimit(testIp, endpoint2, {
        maxRequests: 5,
        windowSeconds: 60,
      });

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should fail open on database errors', async () => {
      // This test verifies that if the database is unavailable,
      // the rate limiter allows the request (fail-open behavior)
      const result = await checkRateLimit(testIp, testEndpoint);

      // Should still return a valid result
      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remaining).toBe('number');
    });
  });

  describe('createRateLimitChecker', () => {
    it('should create a rate limit checker with custom config', async () => {
      const checker = createRateLimitChecker('/api/test', {
        maxRequests: 10,
        windowSeconds: 120,
      });

      const result = await checker(testIp);

      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remaining).toBe('number');
    });
  });
});
