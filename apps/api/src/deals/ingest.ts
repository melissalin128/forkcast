/**
 * Reading a finished run into the database. Called by the webhook, by the
 * reconcile sweep and by the CLI; all three converge here so a run is ingested
 * exactly once no matter who noticed it first.
 *
 *   run status + usageTotalUsd -> dataset items (capped) -> provider.normalize
 *   -> upsertDeals -> retire deals this run should have returned and did not
 *   -> ScrapeRun updated with counts and the real cost
 */
import type { PlatformSlug, ScrapeRun, ScrapeRunKind } from '../models/types';
import type { Repository } from '../repo';
import { isTerminalRunStatus, getApifyClient, type ApifyClient, type ApifyRun } from './apify';
import { findAddress, getDealsConfig, type DealsConfig } from './config';
import { getDealProvider } from './providers';

export interface IngestOptions {
  repo: Repository;
  apifyRunId: string;
  cfg?: DealsConfig;
  client?: ApifyClient;
  /** Used when the run was started outside this app (an Apify Schedule) and has no ledger row yet. */
  fallback?: { platform: PlatformSlug; addressKey: string; kind: ScrapeRunKind };
  /** Ingest again even if the ledger already marks this run finished. */
  force?: boolean;
  now?: Date;
  log?: (line: string) => void;
}

export interface IngestResult {
  ok: boolean;
  /** Nothing to do: already ingested, or the run has not finished yet. */
  skipped?: 'already_ingested' | 'not_finished';
  status: string;
  run?: ScrapeRun;
  resultsReturned: number;
  dealsExtracted: number;
  inserted: number;
  updated: number;
  deactivated: number;
  parseFailures: number;
  storesWithoutDeals: number;
  actualCost?: number;
  error?: string;
}

const FINISHED: Record<string, ScrapeRun['status']> = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  'TIMED-OUT': 'failed',
  ABORTED: 'aborted',
};

export async function ingestRun(opts: IngestOptions): Promise<IngestResult> {
  const cfg = opts.cfg ?? getDealsConfig();
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();
  const client = opts.client ?? getApifyClient();
  const startedMs = Date.now();

  let ledger = await opts.repo.getScrapeRunByApifyId(opts.apifyRunId);
  if (ledger && ['succeeded', 'failed', 'aborted'].includes(ledger.status) && !opts.force) {
    return blank({ ok: true, skipped: 'already_ingested', status: ledger.status, run: ledger });
  }

  let apifyRun: ApifyRun;
  try {
    apifyRun = await client.getRun(opts.apifyRunId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(`[deals] could not read apify run ${opts.apifyRunId}: ${error}`);
    return blank({ ok: false, status: 'unknown', run: ledger ?? undefined, error });
  }

  if (!isTerminalRunStatus(apifyRun.status)) {
    return blank({ ok: true, skipped: 'not_finished', status: apifyRun.status, run: ledger ?? undefined });
  }

  const platform = ledger?.platform ?? opts.fallback?.platform ?? 'doordash';
  const addressKey = ledger?.addressKey ?? opts.fallback?.addressKey;
  const kind: ScrapeRunKind = ledger?.kind ?? opts.fallback?.kind ?? 'feed';

  if (!addressKey) {
    const error = `run ${opts.apifyRunId} is not in the ledger and the caller gave no address`;
    log(`[deals] ${error}`);
    return blank({ ok: false, status: apifyRun.status, error });
  }
  const address = findAddress(cfg, addressKey);
  if (!address) {
    const error = `unknown address "${addressKey}" for run ${opts.apifyRunId}`;
    log(`[deals] ${error}`);
    return blank({ ok: false, status: apifyRun.status, error });
  }

  // an Apify Schedule starts runs we never saw; record them now so the ledger stays complete
  ledger ??= await opts.repo.createScrapeRun({
    platform,
    addressKey,
    kind,
    query: kind === 'feed' ? cfg.feedQueries.join(', ') : undefined,
    actorId: apifyRun.actId,
    apifyRunId: apifyRun.id,
    datasetId: apifyRun.defaultDatasetId,
    startedAt: apifyRun.startedAt ? new Date(apifyRun.startedAt) : now,
    status: 'running',
    estimatedCost: 0,
  });

  const finishedAt = apifyRun.finishedAt ? new Date(apifyRun.finishedAt) : now;
  const status = FINISHED[apifyRun.status] ?? 'failed';
  const actualCost = apifyRun.usageTotalUsd;

  if (status !== 'succeeded') {
    const error = apifyRun.statusMessage ?? `apify run ${apifyRun.status}`;
    const run = await opts.repo.updateScrapeRun(ledger.id, { status, finishedAt, actualCost, error });
    log(`[deals] ${platform} ${kind} run ${apifyRun.id} ${apifyRun.status}: ${error}`);
    return blank({ ok: false, status: apifyRun.status, run: run ?? ledger, actualCost, error });
  }

  let items: unknown[];
  try {
    items = await client.getDatasetItems(apifyRun.defaultDatasetId, { limit: cfg.caps.maxResultsPerRun });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const run = await opts.repo.updateScrapeRun(ledger.id, { status: 'failed', finishedAt, actualCost, error });
    log(`[deals] could not read dataset ${apifyRun.defaultDatasetId}: ${error}`);
    return blank({ ok: false, status: apifyRun.status, run: run ?? ledger, actualCost, error });
  }

  const { deals, failures, storesWithoutDeals } = getDealProvider(platform).normalize(items, { address, now });
  for (const f of failures.slice(0, 10)) {
    log(`[deals] ${platform} run ${apifyRun.id}: skipped item ${f.index}${f.platformRestaurantId ? ` (store ${f.platformRestaurantId})` : ''}: ${f.reason}`);
  }
  if (failures.length > 10) log(`[deals] ${platform} run ${apifyRun.id}: ${failures.length - 10} further parse failures not listed`);

  const { inserted, updated } = await opts.repo.upsertDeals(deals, { at: now, runId: apifyRun.id, runKind: kind });

  /*
   * A feed run sweeps the whole preset list, so anything it did not return is
   * gone and is retired straight away. A search run only looked at one query,
   * so it must not retire the rest of the feed; those age out on the staleness
   * window instead.
   */
  const cutoff = kind === 'feed' ? now : new Date(now.getTime() - cfg.caps.staleAfterHours * 3600 * 1000);
  const deactivated = await opts.repo.deactivateDeals(platform, addressKey, {
    lastSeenBefore: cutoff,
    ...(kind === 'feed' ? { lastRunKind: 'feed' as const } : {}),
  });

  const run = await opts.repo.updateScrapeRun(ledger.id, {
    status: 'succeeded',
    finishedAt,
    actualCost,
    resultsReturned: items.length,
    dealsExtracted: deals.length,
    parseFailures: failures.length,
    error: undefined,
  });

  log(
    `[deals] ${platform} ${kind} run ${apifyRun.id} ingested in ${Date.now() - startedMs} ms: ` +
      `${items.length} results -> ${deals.length} deals (${inserted} new, ${updated} seen again), ` +
      `${deactivated} retired, ${storesWithoutDeals} stores had none, ${failures.length} parse failures, ` +
      `cost ${actualCost === undefined ? 'pending' : `$${actualCost.toFixed(3)}`}`,
  );

  return {
    ok: true,
    status: apifyRun.status,
    run: run ?? ledger,
    resultsReturned: items.length,
    dealsExtracted: deals.length,
    inserted,
    updated,
    deactivated,
    parseFailures: failures.length,
    storesWithoutDeals,
    actualCost,
  };
}

/**
 * Runs the ledger still thinks are in flight: ask Apify, ingest the finished
 * ones, fail the ones that have been stuck far too long. The fallback for a
 * webhook that never arrived; safe to call on a schedule.
 */
export async function reconcileRuns(opts: {
  repo: Repository;
  cfg?: DealsConfig;
  client?: ApifyClient;
  now?: Date;
  /** Runs still not terminal after this long are marked failed. */
  staleAfterMs?: number;
  limit?: number;
  log?: (line: string) => void;
}): Promise<{ checked: number; ingested: number; stillRunning: number; failed: number; results: IngestResult[] }> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((line: string) => console.log(line));
  const staleAfterMs = opts.staleAfterMs ?? 60 * 60 * 1000;
  const pending = await opts.repo.listScrapeRuns({ status: ['queued', 'running'], limit: opts.limit ?? 20 });

  let ingested = 0;
  let stillRunning = 0;
  let failed = 0;
  const results: IngestResult[] = [];

  for (const run of pending) {
    if (!run.apifyRunId) {
      // never reached Apify (the process died between the ledger write and the start call)
      if (now.getTime() - run.startedAt.getTime() > staleAfterMs) {
        await opts.repo.updateScrapeRun(run.id, { status: 'failed', finishedAt: now, error: 'never started on Apify' });
        failed += 1;
      }
      continue;
    }
    const result = await ingestRun({ repo: opts.repo, apifyRunId: run.apifyRunId, cfg: opts.cfg, client: opts.client, now, log });
    results.push(result);
    if (result.skipped === 'not_finished') {
      if (now.getTime() - run.startedAt.getTime() > staleAfterMs) {
        await opts.repo.updateScrapeRun(run.id, {
          status: 'failed',
          finishedAt: now,
          error: `still ${result.status} after ${Math.round((now.getTime() - run.startedAt.getTime()) / 60000)} min`,
        });
        failed += 1;
        log(`[deals] run ${run.apifyRunId} gave up: still ${result.status}`);
      } else {
        stillRunning += 1;
      }
    } else if (result.ok && !result.skipped) {
      ingested += 1;
    }
  }

  return { checked: pending.length, ingested, stillRunning, failed, results };
}

const blank = (over: Partial<IngestResult> & { ok: boolean; status: string }): IngestResult => ({
  resultsReturned: 0,
  dealsExtracted: 0,
  inserted: 0,
  updated: 0,
  deactivated: 0,
  parseFailures: 0,
  storesWithoutDeals: 0,
  ...over,
});
