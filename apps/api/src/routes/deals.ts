/**
 * What the front page reads. Everything here answers from the database; no
 * request ever waits on Apify.
 *
 *   GET  /api/deals            active deals for an address, ranked by score
 *   POST /api/deals/search     answer from the database now, refresh in the background
 *   GET  /api/deals/jobs/:id   poll a background refresh
 *   GET  /api/deals/runs       run ledger: scraper health and credit burned
 */
import { Router } from 'express';
import { z } from 'zod';
import { getRepo } from '../db';
import { getDealsConfig } from '../deals/config';
import { startSearchJob } from '../deals/jobs';
import { dealPlatforms } from '../deals/providers';
import { rankDeals, type ScoredDeal } from '../deals/score';
import { DEAL_TYPES, PLATFORM_SLUGS, type Deal } from '../models/types';
import { HttpError, notFound } from './errors';

export const dealsRouter = Router();

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

const listQuery = z.object({
  address: z.string().trim().min(1).optional(),
  platform: enumOf(PLATFORM_SLUGS).optional(),
  type: enumOf(DEAL_TYPES).optional(),
  maxDistance: z.coerce.number().positive().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

function view(deal: Deal & ScoredDeal) {
  return {
    id: deal.id,
    platform: deal.platform,
    restaurantName: deal.restaurantName,
    platformRestaurantId: deal.platformRestaurantId,
    cuisine: deal.cuisine,
    distanceMi: deal.distanceMi ?? null,
    dealType: deal.dealType,
    headline: deal.headline,
    value: deal.value ?? null,
    minOrder: deal.minOrder ?? null,
    promoCode: deal.promoCode ?? null,
    deepLink: deal.deepLink ?? null,
    /** Best dollar estimate of the saving; `savingsEstimated` marks the per-type fallback. */
    savings: deal.savings,
    savingsEstimated: deal.savingsEstimated,
    score: deal.score,
    firstSeenAt: deal.firstSeenAt.toISOString(),
    lastSeenAt: deal.lastSeenAt.toISOString(),
    expiresAt: deal.expiresAt?.toISOString() ?? null,
  };
}

/** Address to use when the caller names none: the first one configured. */
const defaultAddressKey = (): string => getDealsConfig().addresses[0].key;

// GET /api/deals
dealsRouter.get('/deals', async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const cfg = getDealsConfig();
    const addressKey = q.address ?? defaultAddressKey();
    if (!cfg.addresses.some((a) => a.key === addressKey)) throw new HttpError(400, `unknown address "${addressKey}"`);

    const repo = getRepo();
    const now = new Date();
    const [deals, lastRuns] = await Promise.all([
      repo.listDeals({
        addressKey,
        platform: q.platform,
        dealType: q.type,
        q: q.q,
        maxDistanceMi: q.maxDistance,
        activeOnly: true,
        now,
      }),
      repo.listScrapeRuns({ status: 'succeeded', addressKey, limit: 1 }),
    ]);

    const ranked = rankDeals(deals, cfg.scoreWeights).slice(0, q.limit);
    res.json({
      address: addressKey,
      count: ranked.length,
      totalActive: deals.length,
      refreshedAt: lastRuns[0]?.finishedAt?.toISOString() ?? null,
      platforms: dealPlatforms(),
      deals: ranked.map(view),
    });
  } catch (err) {
    next(err);
  }
});

const searchBody = z.object({
  q: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).optional(),
  platform: enumOf(PLATFORM_SLUGS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  /** Set false to read the database without starting a background refresh. */
  refresh: z.boolean().default(true),
});

// POST /api/deals/search
dealsRouter.post('/deals/search', async (req, res, next) => {
  try {
    const body = searchBody.parse(req.body ?? {});
    const cfg = getDealsConfig();
    const addressKey = body.address ?? defaultAddressKey();
    if (!cfg.addresses.some((a) => a.key === addressKey)) throw new HttpError(400, `unknown address "${addressKey}"`);

    const repo = getRepo();
    const now = new Date();
    const deals = await repo.listDeals({ addressKey, platform: body.platform, q: body.q, activeOnly: true, now });
    const ranked = rankDeals(deals, cfg.scoreWeights).slice(0, body.limit);

    // answer from what we already have, then refresh in the background; the cost guard decides whether it runs
    let job: Record<string, unknown> = { started: false, reason: 'refresh not requested' };
    if (body.refresh) {
      const started = await startSearchJob({ repo, addressKey, platform: body.platform ?? 'doordash', query: body.q, cfg, now });
      job = started.started
        ? { started: true, scrapeRunId: started.run.id, apifyRunId: started.apifyRunId, status: started.run.status }
        : { started: false, code: started.code, reason: started.reason, scrapeRunId: started.run?.id ?? started.existingRunId ?? null };
    }

    res.json({ address: addressKey, query: body.q, count: ranked.length, deals: ranked.map(view), job });
  } catch (err) {
    next(err);
  }
});

// GET /api/deals/jobs/:id  — poll a background refresh
dealsRouter.get('/deals/jobs/:id', async (req, res, next) => {
  try {
    const run = await getRepo().getScrapeRun(req.params.id);
    if (!run) throw notFound('scrape run');
    res.json({
      id: run.id,
      kind: run.kind,
      platform: run.platform,
      address: run.addressKey,
      query: run.query ?? null,
      status: run.status,
      apifyRunId: run.apifyRunId ?? null,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      resultsReturned: run.resultsReturned,
      dealsExtracted: run.dealsExtracted,
      error: run.error ?? null,
    });
  } catch (err) {
    next(err);
  }
});

const runsQuery = z.object({
  since: z.coerce.date().optional(),
  kind: z.enum(['feed', 'search']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /api/deals/runs  — scraper health and credit burn
dealsRouter.get('/deals/runs', async (req, res, next) => {
  try {
    const q = runsQuery.parse(req.query);
    const cfg = getDealsConfig();
    const repo = getRepo();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [runs, spent, spentToday] = await Promise.all([
      repo.listScrapeRuns({ since: q.since, kind: q.kind, limit: q.limit }),
      repo.sumScrapeRunCost(),
      repo.sumScrapeRunCost(dayAgo),
    ]);
    res.json({
      count: runs.length,
      budget: {
        spentUsd: round3(spent),
        spentLast24hUsd: round3(spentToday),
        ceilingUsd: cfg.caps.spendCeilingUsd,
        remainingUsd: round3(Math.max(0, cfg.caps.spendCeilingUsd - spent)),
        caps: cfg.caps,
      },
      runs: runs.map((r) => ({
        id: r.id,
        kind: r.kind,
        platform: r.platform,
        address: r.addressKey,
        query: r.query ?? null,
        status: r.status,
        apifyRunId: r.apifyRunId ?? null,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        resultsReturned: r.resultsReturned,
        dealsExtracted: r.dealsExtracted,
        parseFailures: r.parseFailures,
        estimatedCost: r.estimatedCost,
        actualCost: r.actualCost ?? null,
        error: r.error ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
