import express from 'express';
import helmet from 'helmet';

import type { Config } from './config.js';
import type { Db } from './db.js';
import type { GoogleClient } from './lib/google.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';

export type AppDeps = { db: Db; config: Config; google: GoogleClient };

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // Render (and most hosts) terminate TLS at a proxy; without this every client looks like one IP
  // and rate limiting would punish everybody together.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', authRouter(deps));
  app.use('/me', requireAuth(deps.config), profileRouter(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
