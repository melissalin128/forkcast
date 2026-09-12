import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

/**
 * Load environment from the repo-root .env first (apps/api/src -> ../../../.env,
 * and apps/api/dist -> ../../../.env both resolve to the monorepo root), then
 * fall back to a .env in the current working directory. Real credentials only
 * ever live in .env (git-ignored) and are read from process.env here.
 */
const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: process.env.MONGODB_URI?.trim() || undefined,
  adapter: (process.env.ADAPTER ?? 'mock').trim().toLowerCase(),
  /**
   * Per-platform overrides of ADAPTER, e.g. ADAPTER_GRUBHUB=live keeps Grubhub
   * on the local Playwright scraper while ADAPTER=apify covers the platforms
   * that have actors. Same values as ADAPTER: mock | live | apify.
   */
  adapterOverrides: {
    doordash: process.env.ADAPTER_DOORDASH?.trim().toLowerCase() || undefined,
    ubereats: process.env.ADAPTER_UBEREATS?.trim().toLowerCase() || undefined,
    grubhub: process.env.ADAPTER_GRUBHUB?.trim().toLowerCase() || undefined,
  } as Record<'doordash' | 'ubereats' | 'grubhub', string | undefined>,
  /** ADAPTER=apify. Actor ids live in APIFY_<PLATFORM>_ACTOR (see adapters/apify/actors.ts). */
  apify: {
    token: process.env.APIFY_TOKEN?.trim() ?? '',
    /** Seconds one actor run may take. Over 300 switches to the async run + poll path. */
    timeoutSec: Number(process.env.APIFY_TIMEOUT_SEC ?? 180),
    async: /^(1|true|yes)$/i.test(process.env.APIFY_ASYNC?.trim() ?? ''),
    memoryMbytes: Number(process.env.APIFY_MEMORY_MB ?? 0) || undefined,
    /** Stores wanted per search run — rendered into the actor input as {{limit}}. */
    maxItems: Math.max(1, Number(process.env.APIFY_MAX_ITEMS ?? 20) || 20),
    /**
     * `GET /api/restaurants` serves stored prices instead of starting an actor
     * run per restaurant. A run takes tens of seconds and costs credit, so a
     * page load must never trigger one; `POST /api/scrape` (or
     * `npm run scrape:apify`) is what collects prices. APIFY_STORED_ONLY=0
     * restores on-demand fetching.
     */
    storedOnly: !/^(0|false|no)$/i.test(process.env.APIFY_STORED_ONLY?.trim() ?? ''),
    /** How long a stored price stays servable. Re-collecting is expensive, so this is generous. */
    offerMaxAgeMs: Math.max(1, Number(process.env.APIFY_OFFER_MAX_AGE_MIN ?? 1440) || 1440) * 60 * 1000,
    /**
     * Optional hard cap on dataset rows, enforced by Apify itself. Off by
     * default: actors that emit one row per store *and* one per menu item would
     * have their menus truncated by it. Set it only as a spend backstop.
     */
    hardMaxItems: Math.max(0, Number(process.env.APIFY_HARD_MAX_ITEMS ?? 0) || 0),
  },
  /** Offers fetched from a platform are reused for this long before re-fetching. */
  offerCacheMs: 10 * 60 * 1000,
  /** Default tip used in every total (spec section 7 recommendation). */
  defaultTipPct: 0.15,
  /** Deals layer (src/deals): Apify access. The token is never logged. */
  apify: {
    token: process.env.APIFY_API_KEY?.trim() || undefined,
    /** Shared secret Apify must send back (as ?token=) on POST /api/apify/webhook. */
    webhookSecret: process.env.APIFY_WEBHOOK_SECRET?.trim() || undefined,
    /** Public base URL of this API (e.g. https://forkcast-api.vercel.app), used to build webhook URLs. */
    publicBaseUrl: process.env.API_PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined,
    /**
     * Master switch for spending credit. Off unless DEALS_LIVE_RUNS is
     * explicitly "1"/"true", so a stray request, a local curl or a fresh deploy
     * can never start an actor by accident. Reads and ingests are unaffected:
     * they cost nothing.
     */
    liveRuns: /^(1|true|yes)$/i.test(process.env.DEALS_LIVE_RUNS?.trim() ?? ''),
  },
  /** Bearer token Vercel Cron sends to GET /api/apify/reconcile. */
  cronSecret: process.env.CRON_SECRET?.trim() || undefined,
  /** Override for apps/api/deals.config.json. */
  dealsConfigPath: process.env.DEALS_CONFIG_PATH?.trim() || undefined,
};
