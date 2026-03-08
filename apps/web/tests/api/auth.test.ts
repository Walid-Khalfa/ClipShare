import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock functions
const mockSignInWithOtp = vi.fn();
const mockCheckRateLimit = vi.fn();

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}));

// Mock rate limiting
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// Import handler after mocks
const { POST: magicLinkHandler } = await import('@/app/api/auth/magic-link/route');

describe('POST /api/auth/magic-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    
    // Default: allow all requests
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 3600000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send magic link for valid email', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });

    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('If that email exists');
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/verify',
      },
    });
  });

  it('should handle Supabase error gracefully', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'User not found', status: 400 },
    });

    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    // Returns generic error to prevent enumeration
    expect(response.status).toBe(500);
    expect(data.error).toBe('Unable to send magic link right now');
  });

  it('should reject invalid email format', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'invalid-email' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid email format');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('should reject missing email', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email is required');
  });

  it('should reject non-JSON content type', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Origin': 'http://localhost:3000',
        },
        body: 'email=test@example.com',
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Content-Type must be application/json');
  });

  it('should reject requests from invalid origin', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://malicious-site.com',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Invalid origin');
  });

  it('should handle Supabase server error', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'Internal server error', status: 500 },
    });

    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Unable to send magic link right now');
  });

  it('should handle rate limit exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 3600000),
    });

    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Too many requests');
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  it('should include Retry-After header when rate limited', async () => {
    const resetAt = new Date(Date.now() + 1800000); // 30 minutes
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt,
    });

    const request = new NextRequest(
      new Request('http://localhost:3000/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const response = await magicLinkHandler(request);
    const retryAfter = response.headers.get('Retry-After');

    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter || '0')).toBeGreaterThan(0);
  });
});
