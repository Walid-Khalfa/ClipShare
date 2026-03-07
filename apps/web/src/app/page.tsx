import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-900/20 via-surface-900 to-surface-950 pointer-events-none" />
      
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
      
      <div className="relative z-10 text-center max-w-2xl animate-fade-in">
        <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 tracking-tight font-sans">
          Clipshare
        </h1>
        <p className="text-xl text-surface-300 mb-8 leading-relaxed">
          Record your screen, camera, and microphone. Share instantly with a link.
        </p>
        <div className="flex gap-4 justify-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Link
            href="/record"
            className="px-8 py-4 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
          >
            Start Recording
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 bg-surface-800 hover:bg-surface-700 text-white font-semibold rounded-lg border border-surface-700 hover:border-surface-600 transition-all duration-300 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-surface-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
          >
            Sign In
          </Link>
        </div>
      </div>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-surface-500 text-sm animate-fade-in" style={{ animationDelay: '0.5s' }}>
        <span className="inline-block animate-bounce">↓</span>
      </div>
    </main>
  );
}
