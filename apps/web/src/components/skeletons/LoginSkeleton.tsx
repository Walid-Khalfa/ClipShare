'use client';

export function LoginSkeleton() {
  return (
    <div 
      className="min-h-screen bg-slate-900 flex items-center justify-center p-4"
      aria-busy="true"
      aria-label="Loading sign in page"
    >
      <div className="max-w-md w-full bg-slate-800 rounded-xl p-6 space-y-6">
        <div className="h-8 w-3/4 bg-slate-700 rounded animate-pulse mx-auto" />
        
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-700 rounded-lg animate-pulse" />
        </div>
        
        <div className="h-4 w-48 bg-slate-700 rounded animate-pulse" />
        
        <div className="h-12 w-full bg-primary-500/30 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
