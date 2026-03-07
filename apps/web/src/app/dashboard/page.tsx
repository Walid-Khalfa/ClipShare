'use client';

import { memo, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRecordings } from '@/hooks/useRecordings';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const statusConfig = useMemo(() => {
    switch (status) {
      case 'READY':
        return { class: 'bg-green-500/20 text-green-400', label: 'Ready' };
      case 'PROCESSING':
        return { class: 'bg-yellow-500/20 text-yellow-400', label: 'Processing' };
      case 'FAILED':
        return { class: 'bg-red-500/20 text-red-400', label: 'Failed' };
      case 'UPLOADING':
        return { class: 'bg-blue-500/20 text-blue-400', label: 'Uploading' };
      case 'UPLOADED':
        return { class: 'bg-purple-500/20 text-purple-400', label: 'Uploaded' };
      default:
        return { class: 'bg-slate-600 text-slate-300', label: status };
    }
  }, [status]);

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${statusConfig.class}`}>
      {statusConfig.label}
    </span>
  );
});

const RecordingCard = memo(function RecordingCard({
  recording,
  onDelete,
  onShare,
  onRevokeShare,
}: {
  recording: {
    id: string;
    title: string;
    status: string;
    duration: number | null;
    view_count: number;
    share_token: string | null;
  };
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onRevokeShare: (id: string) => void;
}) {
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <article className="bg-slate-800 rounded-lg p-4 flex items-center gap-4" role="listitem">
      <div 
        className="w-48 h-28 bg-slate-700 rounded flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        <span className="text-slate-500">No preview</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-white truncate">{recording.title}</h3>
        <div className="flex items-center gap-4 text-sm text-slate-400 mt-1">
          <span>{formatDuration(recording.duration)}</span>
          <StatusBadge status={recording.status} />
          <span>{recording.view_count} views</span>
        </div>
      </div>
      
      <div className="flex gap-2 flex-shrink-0" role="group" aria-label={`Actions for ${recording.title}`}>
        {recording.status === 'READY' && (
          <>
            <button
              onClick={() => onShare(recording.id)}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              aria-label={`Share ${recording.title}`}
            >
              Share
            </button>
            {recording.share_token && (
              <button
                onClick={() => onRevokeShare(recording.id)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-label={`Revoke share link for ${recording.title}`}
              >
                Revoke
              </button>
            )}
          </>
        )}
        <button
          onClick={() => onDelete(recording.id)}
          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label={`Delete ${recording.title}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
});

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { recordings, isLoading, error, mutate, pagination } = useRecordings();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    
    try {
      const res = await fetch(`/api/recordings?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        mutate();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [mutate]);

  const handleShare = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recordingId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.shareUrl);
        alert('Share link copied to clipboard!');
        mutate();
      }
    } catch (err) {
      console.error('Failed to share:', err);
    }
  }, [mutate]);

  const handleRevokeShare = useCallback(async (id: string) => {
    try {
      await fetch(`/api/share?recordingId=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      mutate();
    } catch (err) {
      console.error('Failed to revoke:', err);
    }
  }, [mutate]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/');
  }, [logout, router]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" role="status" aria-live="polite">
        <div className="text-white">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Clipshare</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded px-2 py-1"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8" role="main">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">Your Recordings</h2>
          <Link
            href="/record"
            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Create new recording"
          >
            New Recording
          </Link>
        </div>
        
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300" role="alert">
            Failed to load recordings. Please try again.
          </div>
        )}
        
        {recordings.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4" aria-hidden="true">🎬</div>
            <p className="text-slate-400 mb-4">No recordings yet</p>
            <Link
              href="/record"
              className="text-primary-400 hover:text-primary-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
            >
              Create your first recording
            </Link>
          </div>
        ) : (
          <div className="grid gap-4" role="list" aria-label="Recordings list">
            {recordings.map(recording => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                onDelete={handleDelete}
                onShare={handleShare}
                onRevokeShare={handleRevokeShare}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
