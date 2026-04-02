import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getSyncOwnerUserId } from '@/lib/syncService';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

type AuthRejectionReason = 'foreign_owner';

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });
  const [authRejectionReason, setAuthRejectionReason] = useState<AuthRejectionReason | null>(null);
  const forcingForeignOwnerSignOutRef = useRef(false);

  useEffect(() => {
    let active = true;

    const publishSession = (session: Session | null) => {
      if (!active) return;
      setState({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    };

    const admitSession = async (session: Session | null) => {
      if (!session) {
        forcingForeignOwnerSignOutRef.current = false;
        publishSession(null);
        return;
      }

      const syncOwnerUserId = getSyncOwnerUserId();
      if (!syncOwnerUserId || syncOwnerUserId === session.user.id) {
        setAuthRejectionReason(null);
        publishSession(session);
        return;
      }

      setAuthRejectionReason('foreign_owner');
      publishSession(null);

      if (forcingForeignOwnerSignOutRef.current) {
        return;
      }

      forcingForeignOwnerSignOutRef.current = true;
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('[Auth] Forced sign-out failed:', error);
      } finally {
        forcingForeignOwnerSignOutRef.current = false;
        publishSession(null);
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void admitSession(session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      void admitSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    setAuthRejectionReason(null);
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  const clearAuthRejectionReason = useCallback(() => {
    setAuthRejectionReason(null);
  }, []);

  return {
    user: state.user,
    session: state.session,
    loading: state.loading,
    isAuthenticated: !!state.session,
    authRejectionReason,
    clearAuthRejectionReason,
    signUp,
    signIn,
    signOut,
  };
}
