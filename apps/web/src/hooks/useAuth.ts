'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UserMetadata {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

interface UseAuthReturn {
  user: UserMetadata | null;
  isLoading: boolean;
  error: Error | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  mutate: () => void;
}

const AUTH_NETWORK_ERROR_MESSAGE =
  'Unable to reach Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL and confirm the Supabase project is active.';
const AUTH_LOGIN_ERROR_MESSAGE =
  'Unable to send magic link right now. Please try again in a moment.';

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<UserMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function getUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUser({
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name || null,
            createdAt: user.created_at,
          });
        } else {
          setUser(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Auth error'));
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || null,
          createdAt: session.user.created_at,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const login = useCallback(async (email: string) => {
    setError(null);
    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || AUTH_LOGIN_ERROR_MESSAGE);
      }
    } catch (err) {
      const isFetchFailure =
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) ||
        (err instanceof Error && err.message.toLowerCase().includes('failed to fetch'));

      if (isFetchFailure) {
        throw new Error(AUTH_NETWORK_ERROR_MESSAGE);
      }

      if (err instanceof Error) {
        throw err;
      }

      throw new Error('Failed to send magic link');
    }
  }, [supabase]);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
  }, [supabase]);

  const mutate = useCallback(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.name || null,
          createdAt: user.created_at,
        });
      } else {
        setUser(null);
      }
    });
  }, [supabase]);

  return {
    user,
    isLoading,
    error,
    login,
    logout,
    mutate,
  };
}
