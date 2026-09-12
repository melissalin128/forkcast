/**
 * Apify calling us back.
 *
 *   POST /api/apify/webhook     a run finished -> ingest it
 *   GET  /api/apify/reconcile   scheduled sweep for webhooks that never arrived
 *
 * The webhook is a public URL, so it is authenticated with a shared secret
 * (APIFY_WEBHOOK_SECRET) that Apify sends back as ?token=. The reconcile route
 * takes a bearer token (CRON_SECRET) instead, the way Vercel Cron sends it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { getRepo } from '../db';
import { getDealsConfig } from '../deals/config';
import { ingestRun, reconcileRuns } from '../deals/ingest';
import { PLATFORM_SLUGS, type PlatformSlug } from '../models/types';
import { HttpError } from './errors';

export const apifyRouter = Router();

const webhookQuery = z.object({
  token: z.string().optional(),
  platform: z.enum(PLATFORM_SLUGS as unknown as [PlatformSlug, ...PlatformSlug[]]).default('doordash'),
  address: z.string().trim().min(1).optional(),
  kind: z.enum(['feed', 'search']).default('feed'),
});

/** Apify's payload; we only trust the run id in it, and re-read the run from the API. */
const webhookBody = z
  .object({
    eventType: z.string().optional(),
    eventData: z.object({ actorRunId: z.string().optional() }).partial().optional(),
    resource: z.object({ id: z.string().optional(), defaultDatasetId: z.string().optional(), status: z.string().optional() }).partial().optional(),
  })
  .passthrough();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// POST /api/apify/webhook?platform=&address=&kind=&token=
apifyRouter.post('/apify/webhook', async (req, res, next) => {
  try {
    const q = webhookQuery.parse(req.query);
    const expected = config.dealsApify.webhookSecret;
    if (!expected) throw new HttpError(503, 'APIFY_WEBHOOK_SECRET is not configured');
    if (!q.token || !timingSafeEqual(q.token, expected)) throw new HttpError(401, 'invalid webhook token');

    const body = webhookBody.parse(req.body ?? {});
    const apifyRunId = body.eventData?.actorRunId ?? body.resource?.id;
    if (!apifyRunId) throw new HttpError(400, 'no actor run id in the webhook payload');

    const cfg = getDealsConfig();
    const addressKey = q.address ?? cfg.addresses[0].key;
    // a bad address is a setup mistake in the webhook URL, and retrying will not fix it
    if (!cfg.addresses.some((a) => a.key === addressKey)) throw new HttpError(400, `unknown address "${addressKey}"`);

    const result = await ingestRun({
      repo: getRepo(),
      apifyRunId,
      cfg,
      fallback: { platform: q.platform, addressKey, kind: q.kind },
    });

    // 200 even when the run itself failed: the webhook was delivered and handled, and Apify must not retry.
    res.json({
      ok: result.ok,
      apifyRunId,
      status: result.status,
      skipped: result.skipped ?? null,
      dealsExtracted: result.dealsExtracted,
      inserted: result.inserted,
      updated: result.updated,
      deactivated: result.deactivated,
      parseFailures: result.parseFailures,
      actualCost: result.actualCost ?? null,
      error: result.error ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/apify/reconcile  — Vercel Cron, Authorization: Bearer $CRON_SECRET
apifyRouter.get('/apify/reconcile', async (req, res, next) => {
  try {
    const expected = config.cronSecret;
    if (!expected) throw new HttpError(503, 'CRON_SECRET is not configured');
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !timingSafeEqual(token, expected)) throw new HttpError(401, 'invalid cron token');

    const result = await reconcileRuns({ repo: getRepo(), cfg: getDealsConfig() });
    res.json({
      checked: result.checked,
      ingested: result.ingested,
      stillRunning: result.stillRunning,
      failed: result.failed,
    });
  } catch (err) {
    next(err);
  }
});
