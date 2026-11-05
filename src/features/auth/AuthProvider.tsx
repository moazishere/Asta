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

import {
  ApiError,
  apiPublic,
  restoreSession,
  setSessionLostHandler,
  tokenStore,
  type ApiUser,
  type AuthTokens,
} from '@/lib/api';
import { env } from '@/lib/env';
import { t, type StringKey } from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';

// Completes the in-app browser session when the OAuth redirect comes back (needed on web/Android).
WebBrowser.maybeCompleteAuthSession();

type Session = { user: ApiUser };
type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been restored (or found missing). */
  loading: boolean;
  /** Startup could not reach the server, so we do not know yet whether the user is signed in. */
  offline: boolean;
  retry: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const errorKeys: Record<string, StringKey> = {
  invalid_credentials: 'auth.errorInvalid',
  email_taken: 'auth.errorEmailTaken',
  network_error: 'auth.errorNetwork',
  validation_error: 'auth.errorEmail',
};

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return t(errorKeys[err.code] ?? 'common.genericError');
  return t('common.genericError');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const endSession = useCallback(() => {
    setSession(null);
    // Never leak the previous user's cached data into the next session.
    queryClient.clear();
  }, []);

  useEffect(() => {
    setSessionLostHandler(endSession);
    return () => setSessionLostHandler(null);
  }, [endSession]);

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((result) => {
      if (cancelled) return;
      setOffline(result.status === 'offline');
      setSession(result.status === 'ok' ? { user: result.user } : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const startSession = useCallback(async (tokens: AuthTokens) => {
    await tokenStore.set(tokens);
    setSession({ user: tokens.user });
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      try {
        await startSession(await apiPublic<AuthTokens>('/auth/login', { email, password }));
        return { error: null };
      } catch (err) {
        return { error: messageFor(err) };
      }
    },
    [startSession],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password) => {
      try {
        await startSession(await apiPublic<AuthTokens>('/auth/register', { email, password }));
        return { error: null };
      } catch (err) {
        return { error: messageFor(err) };
      }
    },
    [startSession],
  );

  const signInWithGoogle = useCallback<AuthContextValue['signInWithGoogle']>(async () => {
    try {
      // The server runs the whole Google flow and finally redirects to this deep link with a
      // one-time code, which we trade for our own tokens. (asta://auth-callback)
      const redirectTo = Linking.createURL('auth-callback');
      const url = `${env.apiUrl}/auth/google/start?redirect_uri=${encodeURIComponent(redirectTo)}`;
      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
      if (result.type !== 'success') return { error: t('auth.errorGoogle') };

      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') return { error: t('auth.errorGoogle') };
      await startSession(await apiPublic<AuthTokens>('/auth/google/exchange', { code }));
      return { error: null };
    } catch (err) {
      return { error: messageFor(err) };
    }
  }, [startSession]);

  const signOut = useCallback(async () => {
    const refreshToken = await tokenStore.getRefresh();
    // Best effort: even if the server is unreachable the device is signed out locally.
    if (refreshToken) await apiPublic('/auth/logout', { refreshToken }).catch(() => undefined);
    await tokenStore.clear();
    endSession();
  }, [endSession]);

  const value = useMemo(
    () => ({
      session,
      loading,
      offline,
      retry: () => {
        setLoading(true);
        setAttempt((n) => n + 1);
      },
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, offline, signIn, signUp, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
