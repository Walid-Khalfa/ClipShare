'use client';

export function SharePageSkeleton() {
  return (
    <div 
      className="min-h-screen bg-slate-900"
      aria-busy="true"
      aria-label="Loading video"
    >
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="h-7 w-32 bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-slate-700 rounded animate-pulse" />
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-3/4 bg-slate-700 rounded mb-4 animate-pulse" />
        
        <div 
          className="bg-slate-800 rounded-lg overflow-hidden mb-4 aspect-video animate-pulse"
          aria-hidden="true"
        >
          <div className="w-full h-full bg-slate-700" />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-32 bg-slate-700 rounded animate-pulse" />
        </div>
        
        <div className="mt-6">
          <div className="h-12 w-36 bg-primary-500/30 rounded-lg animate-pulse" />
        </div>
      </main>
    </div>
  );
}
