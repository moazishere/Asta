import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { HttpError } from '../errors.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found' });
};

// Express recognises error handlers by their 4 parameters, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }
  // Malformed JSON body etc. from express.json()
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: 'bad_request' });
    return;
  }
  // Never leak internals (SQL, stack traces) to clients.
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
};
