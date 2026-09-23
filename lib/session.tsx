// lib/session.tsx
//
// Holds the signed-in Supabase session for the whole app.
//
// Everything the app reads or writes goes through RLS, and every policy is
// `to authenticated using (auth.uid() = owner_id)`. Without a session the
// anon role matches no policy at all, so a signed-out app cannot read its own
// data or upload a file to a path it is allowed to write. That makes the
// session a precondition for the rest of the app, not a feature on the side.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  /** True until the stored session has been read back from AsyncStorage. */
  loading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // A session persisted by AsyncStorage survives an app restart, so check
    // for one before deciding to show the sign-in screen.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, loading }), [session, loading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** The signed-in user's id, or null. This is the `owner_id` every row needs. */
export function useUserId(): string | null {
  return useSession().session?.user.id ?? null;
}
