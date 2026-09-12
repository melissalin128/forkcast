import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { NotImplementedError } from '../adapters/types';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid request', issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof NotImplementedError) {
    res.status(501).json({ error: err.message });
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'internal error' });
};
