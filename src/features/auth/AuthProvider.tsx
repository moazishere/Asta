import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

// Completes the in-app browser session when the OAuth redirect comes back (needed on web/Android).
WebBrowser.maybeCompleteAuthSession();

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been read from disk. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  /** `needsConfirmation` is true when the project requires email confirmation before first sign-in. */
  signUp: (email: string, password: string) => Promise<AuthResult & { needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
  }, []);

  const signInWithGoogle = useCallback<AuthContextValue['signInWithGoogle']>(async () => {
    // asta://auth-callback must be listed under Supabase > Authentication > URL Configuration.
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { error: error?.message ?? t('auth.errorGoogle') };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { error: t('auth.errorGoogle') };

    const code = new URL(result.url).searchParams.get('code');
    if (!code) return { error: t('auth.errorGoogle') };
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    return { error: exchange.error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Never leak the previous user's cached data into the next session.
    queryClient.clear();
  }, []);

  const value = useMemo(
    () => ({ session, loading, signIn, signUp, signInWithGoogle, signOut }),
    [session, loading, signIn, signUp, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
