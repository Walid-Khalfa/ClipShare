import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock functions
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockCreateSignedUploadUrl = vi.fn();
const mockRemove = vi.fn();

const mockCheckRateLimit = vi.fn();

// Setup mock chain
const createMockChain = () => ({
  select: mockSelect.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
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
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
        remove: mockRemove,
      })),
    },
  })),
}));

// Mock rate limiting
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
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

// Mock env
vi.mock('@/lib/env', () => ({
  MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
  validateFileSize: vi.fn((size: number) => size > 0 && size <= 2 * 1024 * 1024 * 1024),
}));

// Import handler after mocks
const { POST: uploadHandler } = await import('@/app/api/upload/route');

describe('POST /api/upload', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    
    // Default: allow all requests
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 49,
      resetAt: new Date(Date.now() + 60000),
    });

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initiate action', () => {
    it('should initiate upload successfully', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        status: 'CREATED',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });
      mockCreateSignedUploadUrl.mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/upload-url' },
        error: null,
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            contentType: 'video/webm',
            fileSize: 1024 * 1024, // 1MB
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.uploadUrl).toBe('https://storage.supabase.co/upload-url');
      expect(data.path).toContain('uploads/user-123/rec-1/raw');
    });

    it('should reject invalid file size', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            contentType: 'video/webm',
            fileSize: -1, // Invalid negative size
          }),
        })
      );

      const response = await uploadHandler(request);

      // Should fail validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should return 404 for non-existent recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'nonexistent',
            contentType: 'video/webm',
            fileSize: 1024 * 1024,
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });

    it('should prevent initiating upload for other users recordings', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'other-user-recording',
            contentType: 'video/webm',
            fileSize: 1024 * 1024,
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });
  });

  describe('complete action', () => {
    it('should complete upload successfully', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        status: 'UPLOADING',
        raw_path: 'uploads/user-123/rec-1/raw',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            path: 'uploads/user-123/rec-1/raw',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('UPLOADED');
    });

    it('should return 404 for non-existent recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'nonexistent',
            path: 'uploads/user-123/rec-1/raw',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });
  });

  describe('abort action', () => {
    it('should abort upload and remove file', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        status: 'UPLOADING',
        raw_path: 'uploads/user-123/rec-1/raw',
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });
      mockRemove.mockResolvedValue({ data: {}, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=abort', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRemove).toHaveBeenCalledWith(['uploads/user-123/rec-1/raw']);
    });

    it('should handle abort for recording without raw_path', async () => {
      const recording = {
        id: 'rec-1',
        title: 'Test Recording',
        user_id: mockUser.id,
        status: 'CREATED',
        raw_path: null,
      };

      mockSingle.mockResolvedValue({ data: recording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=abort', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  describe('general validation', () => {
    it('should reject requests without authentication', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            contentType: 'video/webm',
            fileSize: 1024 * 1024,
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject invalid action parameter', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=invalid', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid or missing action parameter');
    });

    it('should reject missing action parameter', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid or missing action parameter');
    });

    it('should reject invalid origin', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://malicious-site.com',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            contentType: 'video/webm',
            fileSize: 1024 * 1024,
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Invalid origin');
    });

    it('should handle rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            recordingId: 'rec-1',
            contentType: 'video/webm',
            fileSize: 1024 * 1024,
          }),
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Too many requests');
    });

    it('should reject non-JSON content type', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/upload?action=initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Origin': 'http://localhost:3000',
          },
          body: 'recordingId=rec-1',
        })
      );

      const response = await uploadHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Content-Type must be application/json');
    });
  });
});
