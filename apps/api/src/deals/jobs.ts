/**
 * Starting runs. Both entrypoints go through the cost guard first and write a
 * ScrapeRun row before the actor is told to start, so every Apify run id we
 * ever cause is in the ledger.
 *
 *   startFeedJob   scheduled, preset cuisine list, populates the front page
 *   startSearchJob a user searched for something; the API has already answered
 *                  from the database, this only refreshes it in the background
 *
 * Neither waits for the run. The webhook (or the reconcile sweep) ingests it.
 */
import { config } from '../config';
import type { PlatformSlug, ScrapeRun, ScrapeRunKind } from '../models/types';
import type { Repository } from '../repo';
import { ApifyError, RUN_FINISHED_EVENT_TYPES, getApifyClient, type ApifyClient, type ApifyWebhook } from './apify';
import { actorFor, estimateRunCost, findAddress, getDealsConfig, type DealsConfig } from './config';
import { guardOrSkip, type GuardRefused } from './costGuard';
import { getDealProvider } from './providers';

export interface StartJobOptions {
  repo: Repository;
  /** Override the DEALS_LIVE_RUNS switch. The CLI sets it from --live; tests set it explicitly. */
  allowLiveRuns?: boolean;
  addressKey: string;
  platform?: PlatformSlug;
  cfg?: DealsConfig;
  client?: ApifyClient;
  /** Cap for this run; defaults to caps.maxResultsPerRun. The guard refuses anything above the cap. */
  maxResults?: number;
  now?: Date;
  log?: (line: string) => void;
  /** Print the actor input and the guard verdict, then stop without starting anything. */
  dryRun?: boolean;
}

export interface StartedJob {
  started: true;
  run: ScrapeRun;
  apifyRunId: string;
  estimatedCost: number;
  input: Record<string, unknown>;
}

export interface NotStartedJob {
  started: false;
  reason: string;
  code: GuardRefused['code'] | 'not_configured' | 'dry_run' | 'apify_error' | 'live_runs_disabled';
  run?: ScrapeRun;
  existingRunId?: string;
  input?: Record<string, unknown>;
}

export type StartJobResult = StartedJob | NotStartedJob;

export const startFeedJob = (opts: StartJobOptions): Promise<StartJobResult> => startJob({ ...opts, kind: 'feed' });
export const startSearchJob = (opts: StartJobOptions & { query: string }): Promise<StartJobResult> =>
  startJob({ ...opts, kind: 'search' });

async function startJob(opts: StartJobOptions & { kind: ScrapeRunKind; query?: string }): Promise<StartJobResult> {
  const cfg = opts.cfg ?? getDealsConfig();
  const platform = opts.platform ?? 'doordash';
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();

  const address = findAddress(cfg, opts.addressKey);
  if (!address) return notConfigured(`unknown address "${opts.addressKey}" (deals.config.json addresses)`);
  const actor = actorFor(cfg, platform);
  if (!actor) return notConfigured(`no actor id configured for ${platform} (deals.config.json actors.${platform}.actorId)`);
  const query = opts.kind === 'search' ? opts.query?.trim() : cfg.feedQueries.join(', ');
  if (opts.kind === 'search' && !query) return notConfigured('search needs a non-empty query');

  const liveRuns = opts.allowLiveRuns ?? config.apify.liveRuns;
  const maxResults = opts.maxResults ?? cfg.caps.maxResultsPerRun;
  const estimatedCost = estimateRunCost(actor, maxResults);

  const provider = getDealProvider(platform);
  const input =
    opts.kind === 'feed'
      ? provider.buildInput({ kind: 'feed', address, queries: cfg.feedQueries, maxResults, actor })
      : provider.buildInput({ kind: 'search', address, query: opts.query!.trim(), maxResults, actor });

  const verdict = await guardOrSkip(
    opts.repo,
    cfg,
    { platform, addressKey: address.key, kind: opts.kind, query, actorId: actor.actorId, maxResults, estimatedCost, now },
    log,
  );
  if (!verdict.allowed) {
    return {
      started: false,
      code: verdict.code,
      reason: verdict.reason,
      existingRunId: verdict.existingRunId,
      run: verdict.scrapeRunId ? ((await opts.repo.getScrapeRun(verdict.scrapeRunId)) ?? undefined) : undefined,
      input,
    };
  }

  if (opts.dryRun) {
    log(`[deals] dry run: would start ${platform} ${opts.kind} for ${address.key}, est $${estimatedCost.toFixed(3)}`);
    log(`[deals] actor ${actor.actorId} input: ${JSON.stringify(input)}`);
    return { started: false, code: 'dry_run', reason: 'dry run: nothing was started', input };
  }

  /*
   * Last line of defence before money is spent. The cost guard decides whether a
   * run is affordable; this decides whether this process is allowed to spend at
   * all. Off by default so no stray request, local curl or fresh deploy can
   * start an actor: it has to be turned on deliberately (DEALS_LIVE_RUNS=1, or
   * `npm run deals -- --live`).
   */
  if (!liveRuns) {
    const reason = 'live Apify runs are disabled (set DEALS_LIVE_RUNS=1, or pass --live to the CLI)';
    log(`[deals] not starting ${platform} ${opts.kind} for ${address.key}: ${reason}`);
    return { started: false, code: 'live_runs_disabled', reason, input };
  }

  // the ledger row exists before the actor does, so a crash mid-start still leaves a trace
  const run = await opts.repo.createScrapeRun({
    platform,
    addressKey: address.key,
    kind: opts.kind,
    query,
    actorId: actor.actorId,
    startedAt: now,
    status: 'queued',
    estimatedCost,
  });

  try {
    const client = opts.client ?? getApifyClient();
    const apifyRun = await client.startRun(actor.actorId, input, {
      maxItems: maxResults,
      memoryMbytes: actor.memoryMbytes,
      timeoutSecs: actor.timeoutSecs,
      webhooks: webhooksFor(opts.kind, platform, address.key),
    });
    const updated = await opts.repo.updateScrapeRun(run.id, {
      status: 'running',
      apifyRunId: apifyRun.id,
      datasetId: apifyRun.defaultDatasetId,
    });
    log(
      `[deals] started ${platform} ${opts.kind} for ${address.key}` +
        `${opts.kind === 'search' ? ` "${query}"` : ''}: apify run ${apifyRun.id}, max ${maxResults} results, est $${estimatedCost.toFixed(3)}`,
    );
    return { started: true, run: updated ?? run, apifyRunId: apifyRun.id, estimatedCost, input };
  } catch (err) {
    const reason = err instanceof ApifyError ? err.message : err instanceof Error ? err.message : String(err);
    const failed = await opts.repo.updateScrapeRun(run.id, { status: 'failed', finishedAt: new Date(), error: reason });
    log(`[deals] could not start ${platform} ${opts.kind} for ${address.key}: ${reason}`);
    return { started: false, code: 'apify_error', reason, run: failed ?? run, input };
  }

  function notConfigured(reason: string): NotStartedJob {
    log(`[deals] ${reason}`);
    return { started: false, code: 'not_configured', reason };
  }
}

/**
 * Ask Apify to call us back when the run ends. Without a public base URL the run
 * still happens and the reconcile sweep picks it up; it is just slower.
 */
export function webhooksFor(kind: ScrapeRunKind, platform: PlatformSlug, addressKey: string, baseUrl?: string, secret?: string): ApifyWebhook[] {
  const url = buildWebhookUrl(kind, platform, addressKey, baseUrl, secret);
  return url ? [{ eventTypes: RUN_FINISHED_EVENT_TYPES, requestUrl: url }] : [];
}

export function buildWebhookUrl(
  kind: ScrapeRunKind,
  platform: PlatformSlug,
  addressKey: string,
  baseUrl?: string,
  secret?: string,
): string | undefined {
  const base = (baseUrl ?? config.apify.publicBaseUrl)?.replace(/\/+$/, '');
  if (!base) return undefined;
  const url = new URL(`${base}/api/apify/webhook`);
  url.searchParams.set('platform', platform);
  url.searchParams.set('address', addressKey);
  url.searchParams.set('kind', kind);
  const token = secret ?? config.apify.webhookSecret;
  if (token) url.searchParams.set('token', token);
  return url.toString();
}
