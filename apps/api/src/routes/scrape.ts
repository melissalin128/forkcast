import { Router } from 'express';
import { z } from 'zod';
import { getAdapters } from '../adapters';
import { getRepo } from '../db';
import { PLATFORM_SLUGS, type PlatformSlug } from '../models/types';
import { runScrapeJob, type ScrapeResult } from '../services/scrapeJob';
import { HttpError } from './errors';

export const scrapeRouter = Router();

const body = z.object({
  zip: z.string().regex(/^\d{5}$/, 'zip must be 5 digits'),
  q: z.string().trim().min(1).max(100),
  platforms: z.array(z.enum(PLATFORM_SLUGS as [PlatformSlug, ...PlatformSlug[]])).min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** One scrape at a time per process: the browsers are shared and the sites rate-limit us. */
let running: { startedAt: Date; zip: string; q: string } | null = null;
let last: ScrapeResult | null = null;

// POST /api/scrape  { zip, q, platforms?, limit? }
scrapeRouter.post('/scrape', async (req, res, next) => {
  try {
    const b = body.parse(req.body ?? {});
    if (running) {
      throw new HttpError(409, `a scrape is already running (${running.q} near ${running.zip}, started ${running.startedAt.toISOString()})`);
    }
    running = { startedAt: new Date(), zip: b.zip, q: b.q };
    try {
      const result = await runScrapeJob({
        zip: b.zip,
        q: b.q,
        platforms: b.platforms,
        limit: b.limit,
        repo: getRepo(),
        adapters: getAdapters(),
        log: (line) => console.log(`[scrape] ${line}`),
      });
      last = result;
      res.status(result.allFailed ? 502 : 200).json(result);
    } finally {
      running = null;
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/scrape  -> status of the lock and the last result
scrapeRouter.get('/scrape', (_req, res) => {
  res.json({ running: running ? { ...running, startedAt: running.startedAt.toISOString() } : null, last });
});
