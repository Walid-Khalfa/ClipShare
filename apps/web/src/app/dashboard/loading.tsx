'use client';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Clipshare</h1>
          <div className="flex items-center gap-4">
            <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
          <div className="h-12 w-36 bg-primary-500/50 rounded animate-pulse" />
        </div>
        
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-4 flex items-center gap-4">
              <div className="w-48 h-28 bg-slate-700 rounded flex-shrink-0 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-1/2 bg-slate-700 rounded animate-pulse" />
                <div className="h-4 w-1/3 bg-slate-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
