import { Router } from 'express';
import { adapterMode, platformMode } from '../adapters';
import { getRepo } from '../db';
import { PLATFORM_SLUGS } from '../models/types';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'forkcast-api',
    adapter: adapterMode(),
    adapters: Object.fromEntries(PLATFORM_SLUGS.map((p) => [p, platformMode(p)])),
    store: getRepo().kind,
    time: new Date().toISOString(),
  });
});
