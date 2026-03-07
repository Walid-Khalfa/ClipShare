'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SharedRecording {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  view_count: number;
  created_at: string;
}

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  
  const [recording, setRecording] = useState<SharedRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecording = useCallback(async () => {
    try {
      const res = await fetch(`/api/share?token=${token}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          setError('Recording not found');
        } else {
          setError('Failed to load recording');
        }
        return;
      }
      
      const data = await res.json();
      setRecording(data);
      
      // Track view (fire and forget)
      fetch(`/api/share?token=${token}&action=view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(console.error);
      
    } catch (err) {
      setError('Failed to load recording');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchRecording();
    }
  }, [token, fetchRecording]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert('Link copied!');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" role="status" aria-live="polite">
        <div className="text-white">Loading…</div>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" role="main">
        <div className="text-center" role="alert">
          <div className="text-4xl mb-4" aria-hidden="true">😕</div>
          <h1 className="text-2xl font-bold text-white mb-2">{error || 'Recording not found'}</h1>
          <Link
            href="/"
            className="text-primary-400 hover:text-primary-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded px-2 py-1"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Clipshare</h1>
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded px-2 py-1"
          >
            Create your own
          </Link>
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto px-4 py-8" role="main">
        <h1 className="text-2xl font-bold text-white mb-2">{recording.title}</h1>
        
        <div 
          className="bg-slate-800 rounded-lg overflow-hidden mb-4" 
          role="region" 
          aria-label="Video player"
        >
          <video
            src={recording.videoUrl}
            controls
            className="w-full"
            playsInline
            preload="metadata"
            aria-label={`Video: ${recording.title}`}
          >
            <track kind="captions" />
          </video>
        </div>
        
        <div className="flex items-center justify-between text-slate-400" role="status" aria-live="polite">
          <span>{recording.view_count} views</span>
          <time dateTime={recording.created_at}>{formatDate(recording.created_at)}</time>
        </div>
        
        <div className="mt-6 flex gap-4">
          <button
            onClick={copyLink}
            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            aria-label="Copy share link"
          >
            Copy Link
          </button>
        </div>
      </main>
    </div>
  );
}
