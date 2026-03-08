'use client';

export function RecordPageSkeleton() {
  return (
    <div 
      className="min-h-screen bg-slate-900 flex items-center justify-center p-4"
      aria-busy="true"
      aria-label="Loading recording page"
    >
      <div className="max-w-xl w-full bg-slate-800 rounded-xl p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-700 rounded animate-pulse" />
        
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-5 w-5 bg-slate-700 rounded animate-pulse" />
              <div className="h-5 w-32 bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
        
        <div className="h-14 w-full bg-primary-500/30 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
