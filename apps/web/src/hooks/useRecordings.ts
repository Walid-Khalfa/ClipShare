'use client';

import useSWR from 'swr';

interface Recording {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  duration: number | null;
  status: string;
  raw_path: string | null;
  processed_path: string | null;
  thumbnail_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  is_public: boolean;
  share_token: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface RecordingsResponse {
  data: Recording[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface UseRecordingsReturn {
  recordings: Recording[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: RecordingsResponse['pagination'];
}

// Use internal API routes (same-origin) for serverless deployment
const API_BASE = '/api';

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const error = new Error('Failed to fetch recordings');
    throw error;
  }
  return res.json();
};

export function useRecordings(page = 1, limit = 10): UseRecordingsReturn {
  const { data, isLoading, error, mutate } = useSWR<RecordingsResponse>(
    `${API_BASE}/recordings?page=${page}&limit=${limit}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );

  return {
    recordings: data?.data ?? [],
    isLoading,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? {
      page: 1,
      limit: 10,
      total: 0,
      pages: 0,
    },
  };
}

export function useRecording(id: string) {
  const { data, isLoading, error, mutate } = useSWR<Recording>(
    id ? `${API_BASE}/recordings?id=${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    recording: data ?? null,
    isLoading,
    error: error ?? null,
    mutate,
  };
}
