'use client';

import { RecordingCardSkeleton } from './RecordingCardSkeleton';

interface DashboardSkeletonProps {
  cardCount?: number;
}

export function DashboardSkeleton({ cardCount = 3 }: DashboardSkeletonProps) {
  return (
    <div 
      className="min-h-screen bg-slate-900"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="h-7 w-32 bg-slate-700 rounded animate-pulse" />
          <div className="flex items-center gap-4">
            <div className="h-4 w-32 bg-slate-700 rounded animate-pulse" />
            <div className="h-8 w-20 bg-slate-700 rounded animate-pulse" />
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-48 bg-slate-700 rounded animate-pulse" />
          <div className="h-12 w-36 bg-primary-500/30 rounded-lg animate-pulse" />
        </div>
        
        <div className="space-y-4" role="list" aria-label="Loading recordings">
          {Array.from({ length: cardCount }).map((_, i) => (
            <RecordingCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
