import { Router } from 'express';
import { adapterMode } from '../adapters';
import { getRepo } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'forkcast-api',
    adapter: adapterMode(),
    store: getRepo().kind,
    time: new Date().toISOString(),
  });
});
