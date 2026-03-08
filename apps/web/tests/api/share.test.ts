import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock functions
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockRpc = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const mockCheckRateLimit = vi.fn();

// Setup mock chain
const createMockChain = () => ({
  select: mockSelect.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  single: mockSingle,
});

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
  createAdminClient: vi.fn(() => ({
    from: mockFrom.mockImplementation(() => createMockChain()),
    rpc: mockRpc,
  })),
}));

// Mock rate limiting
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// Mock CDN utilities
vi.mock('@/lib/cdn', () => ({
  getVideoCdnUrl: vi.fn((path: string) => `https://cdn.example.com/${path}`),
  getThumbnailCdnUrl: vi.fn((path: string) => `https://cdn.example.com/${path}`),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
  logRequest: vi.fn(),
  formatError: vi.fn((e) => ({ message: e?.message || 'Unknown error' })),
}));

// Import handlers after mocks
const { GET: getHandler, POST: postHandler, DELETE: deleteHandler } = 
  await import('@/app/api/share/route');

describe('Share API', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    
    // Default: allow all requests
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
      resetAt: new Date(Date.now() + 60000),
    });

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/share', () => {
    it('should create share link for recording', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        is_public: false,
        share_token: null,
      };

      const sharedRecording = {
        ...recording,
        is_public: true,
        share_token: 'share-token-123',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });
      
      // Mock the update chain
      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        return {
          ...createMockChain(),
          single: () => ({ data: selectCallCount === 1 ? recording : sharedRecording, error: null }),
        };
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ recordingId: 'rec-1' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.shareToken).toBeDefined();
      expect(data.shareUrl).toContain('/share/');
    });

    it('should use existing share token if available', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        is_public: true,
        share_token: 'existing-token-123',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ recordingId: 'rec-1' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.shareToken).toBe('existing-token-123');
    });

    it('should return 404 for non-existent recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ recordingId: 'nonexistent' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });

    it('should return 400 if recording ID is missing', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({}),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Recording ID is required');
    });

    it('should reject requests without authentication', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ recordingId: 'rec-1' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject invalid origin', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://malicious-site.com',
          },
          body: JSON.stringify({ recordingId: 'rec-1' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Invalid origin');
    });

    it('should prevent sharing other users recordings', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ recordingId: 'other-user-recording' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });
  });

  describe('DELETE /api/share', () => {
    it('should revoke share link with valid recording ID', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        is_public: true,
        share_token: 'share-token-123',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      // For DELETE, recordingId comes from query params and checks CSRF/content-type
      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?recordingId=rec-1', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
        })
      );

      const response = await deleteHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?recordingId=nonexistent', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
        })
      );

      const response = await deleteHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });

    it('should return 400 if recording ID is missing', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/share', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
        })
      );

      const response = await deleteHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Recording ID is required');
    });
  });

  describe('GET /api/share', () => {
    it('should return shared recording for valid token', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Shared Recording',
        description: 'Test description',
        duration: 120,
        status: 'READY',
        processed_path: 'processed/rec-1.mp4',
        thumbnail_path: 'thumbnails/rec-1.jpg',
        is_public: true,
        share_token: 'valid-token-123',
        view_count: 42,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });
      mockRpc.mockResolvedValue({ error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=valid-token-123')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('rec-1');
      expect(data.title).toBe('Shared Recording');
      expect(data.videoUrl).toContain('cdn.example.com');
      expect(data.thumbnailUrl).toContain('cdn.example.com');
      expect(data.view_count).toBe(42);
    });

    it('should return 404 for invalid token', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=invalid-token')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });

    it('should return 404 for non-public recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=private-recording-token')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
    });

    it('should return 400 if token is missing', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/share')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Token is required');
    });

    it('should return 400 if recording is not ready', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Processing Recording',
        status: 'PROCESSING',
        processed_path: null,
        is_public: true,
        share_token: 'processing-token',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=processing-token')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Recording not ready');
    });

    it('should track view when action=view', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Shared Recording',
        status: 'READY',
        processed_path: 'processed/rec-1.mp4',
        is_public: true,
        share_token: 'view-token',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });
      mockInsert.mockResolvedValue({ error: null });
      mockRpc.mockResolvedValue({ error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=view-token&action=view')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should work without authentication for public shares', async () => {
      // Ensure no auth check happens (this is a public endpoint)
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

      const recording = {
        id: 'rec-1',
        title: 'Public Recording',
        status: 'READY',
        processed_path: 'processed/rec-1.mp4',
        is_public: true,
        share_token: 'public-token',
        view_count: 0,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=public-token')
      );

      const response = await getHandler(request);

      expect(response.status).toBe(200);
    });

    it('should handle rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/share?token=valid-token')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Too many requests');
    });
  });
});
