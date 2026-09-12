import { Router } from 'express';
import { z } from 'zod';
import { getRepo } from '../db';
import { PLATFORM_SLUGS } from '../models/types';

export const promosRouter = Router();

const query = z.object({ platform: z.enum(PLATFORM_SLUGS as [string, ...string[]]).optional() });

// GET /api/promos?platform=doordash
promosRouter.get('/promos', async (req, res, next) => {
  try {
    const q = query.parse(req.query);
    const now = new Date();
    const promos = await getRepo().listActivePromos(now, q.platform);
    res.json({
      now: now.toISOString(),
      count: promos.length,
      promos: promos.map((p) => ({
        id: p.id,
        platformSlug: p.platformSlug,
        code: p.code,
        description: p.description ?? null,
        rule: p.rule,
        startsAt: p.startsAt.toISOString(),
        endsAt: p.endsAt.toISOString(),
        hoursLeft: Math.max(0, Math.round((p.endsAt.getTime() - now.getTime()) / 36e5)),
      })),
    });
  } catch (err) {
    next(err);
  }
});
