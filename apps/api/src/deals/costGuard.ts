/**
 * The single choke point every actor run passes through. Nothing in src/deals
 * calls ApifyClient.startRun without a verdict from here first.
 *
 * Checks, in order:
 *   1. results cap        maxResults <= caps.maxResultsPerRun
 *   2. spend ceiling      sum(actualCost ?? estimatedCost) + this estimate <= caps.spendCeilingUsd
 *   3. daily caps         feed runs per platform / searches, over a rolling 24 h window
 *   4. search cooldown    same query+address+platform within caps.searchCooldownHours (0 = off)
 *   5. in-flight dedupe   an identical run is still queued/running -> reuse it, do not pay twice
 *
 * A refusal for 1-4 is recorded as a ScrapeRun with status "skipped" so it
 * shows up in the ledger; 5 just points at the existing run.
 */
import type { PlatformSlug, ScrapeRunKind, ScrapeRunStatus } from '../models/types';
import type { Repository } from '../repo';
import type { DealsConfig } from './config';

export interface GuardRequest {
  platform: PlatformSlug;
  addressKey: string;
  kind: ScrapeRunKind;
  query?: string;
  actorId: string;
  maxResults: number;
  estimatedCost: number;
  now?: Date;
}

export type GuardCode = 'results_cap' | 'spend_ceiling' | 'feed_cap' | 'search_cap' | 'cooldown' | 'in_flight';

export interface GuardAllowed {
  allowed: true;
  spentSoFar: number;
  estimatedCost: number;
}

export interface GuardRefused {
  allowed: false;
  code: GuardCode;
  reason: string;
  spentSoFar: number;
  /** For `in_flight`: the ScrapeRun that is already doing this work. */
  existingRunId?: string;
  /** For recorded refusals: the skipped ScrapeRun row. */
  scrapeRunId?: string;
}

export type GuardVerdict = GuardAllowed | GuardRefused;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Attempts that reached (or are reaching) Apify. Guard refusals are not spend and do not count against caps. */
const COUNTED: ScrapeRunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'aborted'];

const usd = (n: number): string => `$${n.toFixed(2)}`;

export async function checkCostGuard(repo: Repository, cfg: DealsConfig, req: GuardRequest): Promise<GuardVerdict> {
  const now = req.now ?? new Date();
  const caps = cfg.caps;
  const spentSoFar = await repo.sumScrapeRunCost();
  const refuse = (code: GuardCode, reason: string, extra: Partial<GuardRefused> = {}): GuardRefused => ({
    allowed: false,
    code,
    reason,
    spentSoFar,
    ...extra,
  });

  if (req.maxResults > caps.maxResultsPerRun) {
    return refuse('results_cap', `maxResults ${req.maxResults} exceeds caps.maxResultsPerRun ${caps.maxResultsPerRun}`);
  }
  if (spentSoFar + req.estimatedCost > caps.spendCeilingUsd) {
    return refuse(
      'spend_ceiling',
      `spent ${usd(spentSoFar)} + estimated ${usd(req.estimatedCost)} would exceed the ${usd(caps.spendCeilingUsd)} ceiling`,
    );
  }

  const since = new Date(now.getTime() - DAY_MS);
  if (req.kind === 'feed') {
    const n = await repo.countScrapeRuns({ kind: 'feed', platform: req.platform, since, status: COUNTED });
    if (n >= caps.feedRunsPerDay) {
      return refuse('feed_cap', `${n} ${req.platform} feed runs in the last 24h (cap ${caps.feedRunsPerDay})`);
    }
  } else {
    const n = await repo.countScrapeRuns({ kind: 'search', since, status: COUNTED });
    if (n >= caps.searchesPerDay) {
      return refuse('search_cap', `${n} search runs in the last 24h (cap ${caps.searchesPerDay})`);
    }
    if (caps.searchCooldownHours > 0 && req.query) {
      const cooldownSince = new Date(now.getTime() - caps.searchCooldownHours * 60 * 60 * 1000);
      const recent = await repo.countScrapeRuns({
        kind: 'search',
        platform: req.platform,
        addressKey: req.addressKey,
        query: req.query,
        since: cooldownSince,
        status: COUNTED,
      });
      if (recent > 0) {
        return refuse('cooldown', `"${req.query}" near ${req.addressKey} already ran within ${caps.searchCooldownHours}h`);
      }
    }
  }

  const inFlight = await repo.listScrapeRuns({
    kind: req.kind,
    platform: req.platform,
    addressKey: req.addressKey,
    query: req.query,
    status: ['queued', 'running'],
    limit: 1,
  });
  if (inFlight.length > 0) {
    const r = inFlight[0];
    return refuse('in_flight', `run ${r.id}${r.apifyRunId ? ` (apify ${r.apifyRunId})` : ''} is still ${r.status}`, { existingRunId: r.id });
  }

  return { allowed: true, spentSoFar, estimatedCost: req.estimatedCost };
}

/**
 * checkCostGuard, plus: a refusal on a cap or the ceiling is written to the
 * ledger as a skipped ScrapeRun and logged. Callers only start a run when
 * `verdict.allowed` is true.
 */
export async function guardOrSkip(
  repo: Repository,
  cfg: DealsConfig,
  req: GuardRequest,
  log: (line: string) => void = (line) => console.warn(line),
): Promise<GuardVerdict> {
  const verdict = await checkCostGuard(repo, cfg, req);
  if (verdict.allowed) return verdict;

  const where = `${req.platform}, ${req.addressKey}${req.query ? `, "${req.query}"` : ''}`;
  if (verdict.code === 'in_flight') {
    log(`[deals] ${req.kind} run (${where}) not started: ${verdict.reason}`);
    return verdict;
  }
  const now = req.now ?? new Date();
  const run = await repo.createScrapeRun({
    platform: req.platform,
    addressKey: req.addressKey,
    kind: req.kind,
    query: req.query,
    actorId: req.actorId,
    startedAt: now,
    finishedAt: now,
    status: 'skipped',
    estimatedCost: req.estimatedCost,
    error: `${verdict.code}: ${verdict.reason}`,
  });
  log(`[deals] cost guard refused ${req.kind} run (${where}): ${verdict.reason} [scrapeRun ${run.id}]`);
  return { ...verdict, scrapeRunId: run.id };
}
