import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import type { Config } from '../config.js';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Random opaque secret (refresh tokens, one-time codes). Only its hash is stored. */
export const newSecret = () => randomBytes(32).toString('base64url');

export function signAccessToken(userId: string, config: Config): string {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    expiresIn: config.accessTokenTtlS,
    algorithm: 'HS256',
  });
}

/** Returns the user id, or null for a missing/expired/forged token. */
export function verifyAccessToken(token: string, config: Config): string | null {
  try {
    // Pin the algorithm: never let the token choose how it is verified.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Short-lived signed state for the Google redirect round trip. */
export function signState(data: { redirectUri: string }, config: Config): string {
  return jwt.sign({ ...data, purpose: 'google_state' }, config.jwtSecret, {
    expiresIn: 10 * 60,
    algorithm: 'HS256',
  });
}

export function verifyState(state: string, config: Config): { redirectUri: string } | null {
  try {
    const p = jwt.verify(state, config.jwtSecret, { algorithms: ['HS256'] });
    if (
      typeof p === 'object' &&
      p.purpose === 'google_state' &&
      typeof p.redirectUri === 'string'
    ) {
      return { redirectUri: p.redirectUri };
    }
    return null;
  } catch {
    return null;
  }
}
