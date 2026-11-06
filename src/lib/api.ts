import * as SecureStore from 'expo-secure-store';

import { env } from './env';

export type ApiUser = { id: string; email: string };
export type AuthTokens = {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/** Error from the API. `code` is the machine-readable `error` field (e.g. "email_taken"). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const REFRESH_KEY = 'asta.refreshToken';

// The access token is short-lived and kept in memory only. The refresh token is the long-lived secret,
// so it goes in the platform keystore (iOS Keychain / Android Keystore) via SecureStore.
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const tokenStore = {
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async set(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>) {
    accessToken = tokens.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  },
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

/**
 * The current access token, after making sure it is still valid (a cheap authenticated call refreshes
 * it if it expired). Used by the live-updates WebSocket, which cannot refresh tokens on its own.
 */
export async function freshAccessToken(): Promise<string | null> {
  await apiFetch('/me').catch(() => undefined);
  return accessToken;
}

/** AuthProvider registers this so a dead refresh token signs the user out of the UI. */
export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'unknown_error', data.message);
  return data as T;
}

type RefreshOutcome =
  | { status: 'ok'; tokens: AuthTokens }
  | { status: 'none' } // nothing stored, or the server rejected the token: signed out
  | { status: 'offline' }; // could not reach the server: keep the stored token and try again later

// Several requests can hit a 401 at once; they must share ONE refresh, because each refresh token is
// single-use (rotation). Two parallel refreshes would look like token theft and kill the session.
let refreshing: Promise<RefreshOutcome> | null = null;

function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= (async (): Promise<RefreshOutcome> => {
    try {
      const refreshToken = await tokenStore.getRefresh();
      if (!refreshToken) return { status: 'none' };
      const tokens = await request<AuthTokens>('/auth/refresh', { body: { refreshToken } });
      await tokenStore.set(tokens);
      return { status: 'ok', tokens };
    } catch (err) {
      // Only a definite "token rejected" ends the session; a flaky network must not log people out.
      if (err instanceof ApiError && err.status === 401) {
        await tokenStore.clear();
        onSessionLost?.();
        return { status: 'none' };
      }
      return { status: 'offline' };
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Called once at app start: turns the stored refresh token back into a live session. */
export async function restoreSession(): Promise<
  { status: 'ok'; user: ApiUser } | { status: 'none' } | { status: 'offline' }
> {
  const outcome = await refreshSession();
  return outcome.status === 'ok' ? { status: 'ok', user: outcome.tokens.user } : outcome;
}

/** Authenticated call: attaches the access token and transparently refreshes it once on 401. */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  try {
    return await request<T>(path, { ...options, token: accessToken });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await refreshSession()).status === 'ok') {
      return request<T>(path, { ...options, token: accessToken });
    }
    throw err;
  }
}

/** Unauthenticated call (login, register, ...). */
export const apiPublic = <T>(path: string, body: unknown) => request<T>(path, { body });
