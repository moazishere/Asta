import type { NextFunction, Request, Response } from 'express';

import type { Config } from '../config.js';
import { HttpError } from '../errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth. */
    userId?: string;
  }
}

export function requireAuth(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const userId = token ? verifyAccessToken(token, config) : null;
    if (!userId) return next(new HttpError(401, 'unauthorized', 'Missing or invalid access token'));
    req.userId = userId;
    next();
  };
}

/** For handlers behind requireAuth. */
export function currentUserId(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'unauthorized');
  return req.userId;
}
