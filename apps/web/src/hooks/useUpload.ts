'use client';

import { useState, useCallback } from 'react';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/env';

interface UploadOptions {
  recordingId: string;
  blob: Blob;
  onProgress?: (progress: number) => void;
}

interface UseUploadReturn {
  upload: (options: UploadOptions) => Promise<void>;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

const MAX_RETRIES = 3;
// Use internal API routes (same-origin) for serverless deployment
const API_BASE = '/api';

export function useUpload(): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async ({ recordingId, blob, onProgress }: UploadOptions) => {
    // Validate file size on client-side before upload
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`);
    }

    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      const contentType = blob.type || 'video/webm';

      const initRes = await fetch(`${API_BASE}/upload?action=initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId, contentType, fileSize: blob.size }),
        credentials: 'include',
      });

      if (!initRes.ok) {
        if (initRes.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to initiate upload');
      }

      const { uploadUrl, path } = await initRes.json();

      let retries = 0;
      let success = false;

      while (!success && retries < MAX_RETRIES) {
        try {
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': contentType },
          });

          if (!uploadRes.ok) {
            throw new Error('Failed to upload file');
          }

          success = true;
          setProgress(100);
          onProgress?.(100);

        } catch (err) {
          retries++;
          if (retries >= MAX_RETRIES) {
            throw new Error('Upload failed after retries');
          }
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }

      const completeRes = await fetch(`${API_BASE}/upload?action=complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId, path }),
        credentials: 'include',
      });

      if (!completeRes.ok) {
        if (completeRes.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to complete upload');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { upload, isUploading, progress, error };
}
