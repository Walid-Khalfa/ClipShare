'use client';

import { useState, useCallback, FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      await login(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  }, [email, login]);

  if (sent) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" role="status" aria-live="polite">
        <div className="max-w-md w-full bg-slate-800 rounded-xl p-6 text-center" role="region" aria-label="Email sent confirmation">
          <div className="text-4xl mb-4" aria-hidden="true">✉️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
          <p className="text-slate-400">
            We sent a magic link to <span className="text-white font-medium">{email}</span>
          </p>
          <p className="text-slate-500 text-sm mt-4">
            Click the link in the email to sign in
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" role="main">
      <div className="max-w-md w-full bg-slate-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Sign in to Clipshare</h1>
        
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300" role="alert">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <label htmlFor="email" className="block text-sm text-slate-400 mb-2">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-describedby="email-hint"
          />
          <p id="email-hint" className="text-slate-500 text-sm mt-2">
            We&apos;ll email you a link to sign in
          </p>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
            aria-label={loading ? 'Sending magic link' : 'Send magic link'}
          >
            {loading ? 'Sending…' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
