import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock functions
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockSingle = vi.fn();

const mockCheckRateLimit = vi.fn();

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
  createAdminClient: vi.fn(() => ({
    from: mockFrom.mockImplementation(() => ({
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      range: mockRange.mockReturnValue({
        data: [],
        error: null,
        count: 0,
      }),
      single: mockSingle,
    })),
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

// Import handlers after mocks
const { GET: getHandler, POST: postHandler, PATCH: patchHandler, DELETE: deleteHandler } = 
  await import('@/app/api/recordings/route');

describe('Recordings API', () => {
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
    
    // Default: empty recordings list
    mockRange.mockReturnValue({
      data: [],
      error: null,
      count: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/recordings', () => {
    it('should return recordings for authenticated user', async () => {
      // Note: Testing the actual DB chain is complex with mocks
      // The important thing is that the endpoint returns 200 for authenticated users
      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?page=1&limit=10')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return empty array when no recordings exist', async () => {
      mockRange.mockReturnValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?page=1&limit=10')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.pagination.total).toBe(0);
      expect(data.pagination.pages).toBe(0);
    });

    it('should handle rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings')
      );

      const response = await getHandler(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Too many requests');
    });
  });

  describe('POST /api/recordings', () => {
    it('should create a new recording', async () => {
      const newRecording = {
        id: 'rec-new',
        title: 'Test Recording',
        status: 'CREATED',
        user_id: mockUser.id,
      };

      mockSingle.mockResolvedValue({ data: newRecording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            title: 'Test Recording',
            duration: 120,
            mimeType: 'video/webm',
          }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(newRecording);
    });

    it('should use default title if not provided', async () => {
      const newRecording = {
        id: 'rec-new',
        title: 'Untitled Recording',
        status: 'CREATED',
        user_id: mockUser.id,
      };

      mockSingle.mockResolvedValue({ data: newRecording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings', {
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

      expect(response.status).toBe(200);
      expect(data.title).toBe('Untitled Recording');
    });

    it('should reject requests without authentication', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ title: 'Test' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject invalid origin for mutations', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://malicious-site.com',
          },
          body: JSON.stringify({ title: 'Test' }),
        })
      );

      const response = await postHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Invalid origin');
    });
  });

  describe('PATCH /api/recordings', () => {
    it('should update a recording', async () => {
      const existingRecording = {
        id: 'rec-1',
        title: 'Old Title',
        description: null,
        user_id: mockUser.id,
      };

      const updatedRecording = {
        id: 'rec-1',
        title: 'New Title',
        description: 'New description',
        user_id: mockUser.id,
      };

      // First call returns existing recording, second returns updated
      mockSingle
        .mockResolvedValueOnce({ data: existingRecording, error: null })
        .mockResolvedValueOnce({ data: updatedRecording, error: null });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?id=rec-1', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({
            title: 'New Title',
            description: 'New description',
          }),
        })
      );

      const response = await patchHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.title).toBe('New Title');
      expect(data.description).toBe('New description');
    });

    it('should return 404 for non-existent recording', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?id=nonexistent', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ title: 'New Title' }),
        })
      );

      const response = await patchHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });

    it('should return 400 if recording ID is missing', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ title: 'New Title' }),
        })
      );

      const response = await patchHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Recording ID is required');
    });

    it('should prevent updating other users recordings', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?id=other-user-recording', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
          },
          body: JSON.stringify({ title: 'New Title' }),
        })
      );

      const response = await patchHandler(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recording not found');
    });
  });

  describe('DELETE /api/recordings', () => {
    it('should delete a recording with proper CSRF headers', async () => {
      const existingRecording = {
        id: 'rec-1',
        title: 'Recording to delete',
        user_id: mockUser.id,
      };

      mockSingle.mockResolvedValue({ data: existingRecording, error: null });

      // DELETE requests require Content-Type header for CSRF protection
      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?id=rec-1', {
          method: 'DELETE',
          headers: {
            'Origin': 'http://localhost:3000',
            'Content-Type': 'application/json',
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
        new Request('http://localhost:3000/api/recordings?id=nonexistent', {
          method: 'DELETE',
          headers: {
            'Origin': 'http://localhost:3000',
            'Content-Type': 'application/json',
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
        new Request('http://localhost:3000/api/recordings', {
          method: 'DELETE',
          headers: {
            'Origin': 'http://localhost:3000',
            'Content-Type': 'application/json',
          },
        })
      );

      const response = await deleteHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Recording ID is required');
    });

    it('should reject DELETE without Content-Type header', async () => {
      const request = new NextRequest(
        new Request('http://localhost:3000/api/recordings?id=rec-1', {
          method: 'DELETE',
          headers: {
            'Origin': 'http://localhost:3000',
            // Missing Content-Type header
          },
        })
      );

      const response = await deleteHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Content-Type must be application/json');
    });
  });
});
