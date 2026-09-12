/**
 * `npm run deals -- ...` — the manual entrypoint for the Apify deals layer.
 *
 * Nothing here spends credit unless you pass --live (or DEALS_LIVE_RUNS=1 is
 * set). Without it, --feed and --q report the actor input and the cost guard's
 * verdict and stop, exactly like --dry-run.
 * This is how the layer is developed, debugged and run by hand; the scheduled
 * feed goes through Apify Schedules and the webhook instead.
 *
 *   --feed                      start the preset cuisine feed for an address
 *   --q "<query>"               start a search run for one restaurant or cuisine
 *   --dry-run                   print the guard verdict and the actor input, start nothing
 *   --fixture <file>            normalize a saved fixture into the database, no Apify call
 *   --ingest-run <apifyRunId>   ingest a run that already happened, no new spend
 *                               (--force re-normalizes one already ingested)
 *   --dump-run <apifyRunId>     save a finished run's dataset as a fixture, no new spend
 *   --reconcile                 ingest any runs the webhook missed
 *   --status                    print the ledger: recent runs, deals, credit burned
 *
 * Nothing here starts an actor without --feed or --q, and both pass the cost guard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connectDb, disconnectDb } from './db';
import { getApifyClient } from './deals/apify';
import { findAddress, getDealsConfig } from './deals/config';
import { ingestRun, reconcileRuns } from './deals/ingest';
import { startFeedJob, startSearchJob } from './deals/jobs';
import { getDealProvider } from './deals/providers';
import { rankDeals } from './deals/score';
import { PLATFORM_SLUGS, type PlatformSlug } from './models/types';

const log = (line: string): void => console.error(line);

interface Args {
  address: string;
  platform: PlatformSlug;
  feed: boolean;
  query?: string;
  maxResults?: number;
  dryRun: boolean;
  fixture?: string;
  ingestRun?: string;
  dumpRun?: string;
  out?: string;
  reconcile: boolean;
  status: boolean;
  wait: boolean;
  json: boolean;
  live: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    const [, inline] = argv[i].split('=');
    return inline ?? argv[i + 1];
  };
  const has = (name: string): boolean => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const platform = (get('platform') ?? 'doordash').trim().toLowerCase();
  if (!(PLATFORM_SLUGS as string[]).includes(platform)) throw new Error(`--platform must be one of ${PLATFORM_SLUGS.join(', ')}`);
  const max = get('max-results');
  return {
    address: get('address') ?? getDealsConfig().addresses[0].key,
    platform: platform as PlatformSlug,
    feed: has('feed'),
    query: get('q') ?? get('query'),
    maxResults: max ? Number(max) : undefined,
    dryRun: has('dry-run'),
    fixture: get('fixture'),
    ingestRun: get('ingest-run'),
    dumpRun: get('dump-run'),
    out: get('out'),
    reconcile: has('reconcile'),
    status: has('status'),
    wait: has('wait'),
    json: has('json'),
    live: has('live'),
    force: has('force'),
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = getDealsConfig();
  const repo = await connectDb();
  const address = findAddress(cfg, args.address);
  if (!address) throw new Error(`unknown address "${args.address}". Configured: ${cfg.addresses.map((a) => a.key).join(', ')}`);

  if (args.status) return printStatus(repo, args);
  if (args.dumpRun) return dumpRun(args);
  if (args.fixture) return ingestFixture(repo, args, address);
  if (args.reconcile) {
    const res = await reconcileRuns({ repo, cfg, log });
    console.log(`checked ${res.checked} pending run(s): ${res.ingested} ingested, ${res.stillRunning} still running, ${res.failed} given up on`);
    return 0;
  }
  if (args.ingestRun) {
    const res = await ingestRun({
      repo,
      apifyRunId: args.ingestRun,
      cfg,
      log,
      force: args.force,
      fallback: { platform: args.platform, addressKey: address.key, kind: 'feed' },
    });
    if (res.skipped === 'already_ingested') console.error('already ingested; pass --force to re-normalize it into the database');
    if (args.json) console.log(JSON.stringify(res, null, 2));
    return res.ok ? 0 : 1;
  }

  if (!args.feed && !args.query) {
    console.error(
      'Nothing to do. Pick one:\n' +
        '  --feed --live              start the preset cuisine feed (COSTS CREDIT)\n' +
        '  --q "<query>" --live       start a search run (COSTS CREDIT)\n' +
        '  --dry-run --feed           show the guard verdict and actor input, start nothing\n' +
        '  --fixture <file>           normalize a saved fixture into the database\n' +
        '  --ingest-run <apifyRunId>  ingest a run that already happened (--force to re-do it)\n' +
        '  --dump-run <apifyRunId>    save a finished run as a fixture\n' +
        '  --reconcile                ingest runs the webhook missed\n' +
        '  --status                   show runs, deals and credit burned',
    );
    return 2;
  }

  const common = {
    repo, addressKey: address.key, platform: args.platform, cfg,
    maxResults: args.maxResults, dryRun: args.dryRun, allowLiveRuns: args.live, log,
  };
  const res = args.feed ? await startFeedJob(common) : await startSearchJob({ ...common, query: args.query! });

  if (!res.started) {
    if (res.input) console.log(JSON.stringify(res.input, null, 2));
    console.error(`not started (${res.code}): ${res.reason}`);
    return res.code === 'dry_run' ? 0 : 1;
  }
  console.log(`apify run ${res.apifyRunId} started, estimated $${res.estimatedCost.toFixed(3)} (scrapeRun ${res.run.id})`);

  if (!args.wait) {
    console.error('Not waiting. The webhook ingests it, or run: npm run deals -- --ingest-run ' + res.apifyRunId);
    return 0;
  }
  log('[deals] waiting for the run to finish…');
  await getApifyClient().waitForRun(res.apifyRunId, { onPoll: (r) => log(`[deals] ${r.id} ${r.status}`) });
  const ingested = await ingestRun({ repo, apifyRunId: res.apifyRunId, cfg, log });
  if (args.json) console.log(JSON.stringify(ingested, null, 2));
  return ingested.ok ? 0 : 1;
}

/** Normalize a saved fixture straight into the store. No Apify call, no cost, no ScrapeRun. */
async function ingestFixture(repo: Awaited<ReturnType<typeof connectDb>>, args: Args, address: ReturnType<typeof findAddress>): Promise<number> {
  const file = path.resolve(args.fixture!);
  const items = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown[];
  if (!Array.isArray(items)) throw new Error(`${file} must contain a JSON array of dataset items`);
  const now = new Date();
  const { deals, failures, storesWithoutDeals } = getDealProvider(args.platform).normalize(items, { address: address!, now });
  for (const f of failures) log(`[deals] skipped item ${f.index}: ${f.reason}`);
  const { inserted, updated } = await repo.upsertDeals(deals, { at: now, runId: `fixture:${path.basename(file)}`, runKind: 'feed' });
  console.log(
    `${path.basename(file)}: ${items.length} items -> ${deals.length} deals (${inserted} new, ${updated} updated), ` +
      `${storesWithoutDeals} stores had none, ${failures.length} parse failures`,
  );
  return failures.length > 0 && deals.length === 0 ? 1 : 0;
}

/** Save a finished run's dataset as a fixture. Reading a dataset is free. */
async function dumpRun(args: Args): Promise<number> {
  const client = getApifyClient();
  const run = await client.getRun(args.dumpRun!);
  const items = await client.getDatasetItems(run.defaultDatasetId, { limit: getDealsConfig().caps.maxResultsPerRun });
  const out = path.resolve(args.out ?? `src/deals/__fixtures__/${args.platform}-run-${run.id}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(items, null, 2)}\n`);
  console.log(`wrote ${items.length} items from run ${run.id} to ${out}`);
  return 0;
}

async function printStatus(repo: Awaited<ReturnType<typeof connectDb>>, args: Args): Promise<number> {
  const cfg = getDealsConfig();
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [runs, deals, spent, spentToday] = await Promise.all([
    repo.listScrapeRuns({ limit: 10 }),
    repo.listDeals({ addressKey: args.address }),
    repo.sumScrapeRunCost(),
    repo.sumScrapeRunCost(since),
  ]);

  if (args.json) {
    console.log(JSON.stringify({ runs, deals: deals.length, spent, spentToday }, null, 2));
    return 0;
  }

  console.log(`store=${repo.kind}  address=${args.address}  active deals=${deals.length}`);
  console.log(`credit: $${spent.toFixed(3)} of $${cfg.caps.spendCeilingUsd.toFixed(2)} used ($${spentToday.toFixed(3)} in the last 24h)`);
  console.log('');
  if (runs.length === 0) console.log('no runs yet');
  else {
    console.log('when                 kind   status     results deals  cost     detail');
    console.log('-'.repeat(92));
    for (const r of runs) {
      const cost = r.actualCost ?? r.estimatedCost;
      console.log(
        `${r.startedAt.toISOString().slice(0, 19).replace('T', ' ')}  ${r.kind.padEnd(6)} ${r.status.padEnd(10)} ` +
          `${String(r.resultsReturned).padStart(7)} ${String(r.dealsExtracted).padStart(5)}  ` +
          `$${cost.toFixed(3).padStart(6)}  ${r.apifyRunId ?? r.error?.slice(0, 40) ?? ''}`,
      );
    }
  }

  const top = rankDeals(deals, cfg.scoreWeights).slice(0, 10);
  if (top.length > 0) {
    console.log('\ntop deals by score');
    console.log('-'.repeat(92));
    for (const d of top) {
      const dist = d.distanceMi === undefined ? '  ? mi' : `${d.distanceMi.toFixed(1)} mi`;
      console.log(`${d.score.toFixed(2).padStart(6)}  ${dist}  ${d.restaurantName.slice(0, 26).padEnd(26)} ${d.headline.slice(0, 42)}`);
    }
  }
  return 0;
}

main()
  .then(async (code) => {
    await disconnectDb();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(`[deals] ${err instanceof Error ? err.message : String(err)}`);
    await disconnectDb().catch(() => undefined);
    process.exit(2);
  });
