'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function VerifyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    async function verify() {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setStatus('error');
          return;
        }

        if (data.session) {
          setStatus('success');
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (sessionError) {
              console.error('Session error:', sessionError);
              setStatus('error');
            } else {
              setStatus('success');
              setTimeout(() => router.push('/dashboard'), 1000);
            }
          } else {
            const searchParams = new URLSearchParams(window.location.search);
            const code = searchParams.get('code');
            
            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              
              if (exchangeError) {
                console.error('Code exchange error:', exchangeError);
                setStatus('error');
              } else {
                setStatus('success');
                setTimeout(() => router.push('/dashboard'), 1000);
              }
            } else {
              setStatus('error');
            }
          }
        }
      } catch (err) {
        console.error('Verify error:', err);
        setStatus('error');
      }
    }

    verify();
  }, [router, supabase]);

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Verifying...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Invalid or expired link</h1>
          <button
            onClick={() => router.push('/login')}
            className="text-primary-400 hover:text-primary-300"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-white">Success! Redirecting...</div>
    </div>
  );
}
