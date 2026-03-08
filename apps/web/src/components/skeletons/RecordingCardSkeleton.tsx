'use client';

interface RecordingCardSkeletonProps {
  className?: string;
}

export function RecordingCardSkeleton({ className = '' }: RecordingCardSkeletonProps) {
  return (
    <article 
      className={`bg-slate-800 rounded-lg p-4 flex items-center gap-4 animate-pulse ${className}`}
      aria-busy="true"
      aria-label="Loading recording"
    >
      <div 
        className="w-48 h-28 bg-slate-700 rounded flex-shrink-0"
        aria-hidden="true"
      />
      
      <div className="flex-1 min-w-0 space-y-3">
        <div className="h-6 w-3/4 bg-slate-700 rounded" />
        <div className="flex items-center gap-4">
          <div className="h-4 w-16 bg-slate-700 rounded" />
          <div className="h-4 w-20 bg-slate-700 rounded" />
          <div className="h-4 w-12 bg-slate-700 rounded" />
        </div>
      </div>
      
      <div className="flex gap-2 flex-shrink-0">
        <div className="h-10 w-20 bg-slate-700 rounded-lg" />
        <div className="h-10 w-20 bg-slate-700 rounded-lg" />
      </div>
    </article>
  );
}
