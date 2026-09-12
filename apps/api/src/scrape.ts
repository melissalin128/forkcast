/**
 * `npm run scrape -- --zip 15213 --q ramen --platforms doordash,ubereats,grubhub --limit 10`
 *
 * Runs the live scrapers for one zip + query, joins the same restaurant across
 * platforms, stores offers + price snapshots through the Repository and prints
 * a comparison table. `--every 30` repeats every 30 minutes (`npm run scrape:watch`).
 * `--allow-mock` prices a platform with the mock adapter when its scraper fails.
 * `--json` prints the full result instead of the table.
 *
 * Exit code is non-zero only when every requested platform failed.
 */
import { closeAdapters, createAdapters } from './adapters';
import { connectDb, disconnectDb } from './db';
import { PLATFORM_SLUGS, type PlatformSlug } from './models/types';
import { formatTable, runScrapeJob, type ScrapeResult } from './services/scrapeJob';

interface Args {
  zip: string;
  q: string;
  platforms: PlatformSlug[];
  limit: number;
  every?: number;
  allowMock: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    const [, inline] = argv[i].split('=');
    return inline ?? argv[i + 1];
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);
  const zip = get('zip') ?? '15213';
  const q = get('q') ?? get('query') ?? '';
  const platforms = (get('platforms') ?? PLATFORM_SLUGS.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/[^a-z]/g, ''))
    .filter((s): s is PlatformSlug => (PLATFORM_SLUGS as string[]).includes(s));
  if (!/^\d{5}$/.test(zip)) throw new Error(`--zip must be 5 digits (got "${zip}")`);
  if (!q) throw new Error('--q is required (a dish or restaurant name, e.g. --q pizza)');
  if (platforms.length === 0) throw new Error(`--platforms must list some of ${PLATFORM_SLUGS.join(',')}`);
  const every = get('every');
  return {
    zip,
    q,
    platforms,
    limit: Math.max(1, Number(get('limit') ?? 10) || 10),
    every: every ? Math.max(1, Number(every) || 30) : undefined,
    allowMock: has('allow-mock'),
    json: has('json'),
  };
}

async function once(args: Args): Promise<ScrapeResult> {
  const repo = await connectDb();
  const adapters = createAdapters('live');
  try {
    const result = await runScrapeJob({
      zip: args.zip,
      q: args.q,
      platforms: args.platforms,
      limit: args.limit,
      repo,
      adapters,
      allowMock: args.allowMock,
      log: (line) => console.error(line),
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`\n${args.q} near ${args.zip} at ${result.finishedAt}\n`);
      console.log(formatTable(result));
      console.log('');
      for (const p of args.platforms) {
        const s = result.platforms[p];
        if (!s) continue;
        const status = s.ok ? `ok: ${s.listings} listings, ${s.offers} priced` : `FAILED: ${s.error}`;
        console.log(`${p.padEnd(9)} ${status}${s.mock ? ' [mock fallback]' : ''}${s.blocked ? ' [BLOCKED]' : ''}`);
      }
    }
    return result;
  } finally {
    await closeAdapters(adapters);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let stopping = false;
  const stop = () => {
    stopping = true;
    console.error('\n[scrape] stopping…');
    void closeAdapters().then(() => disconnectDb()).finally(() => process.exit(130));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let lastAllFailed = false;
  do {
    try {
      lastAllFailed = (await once(args)).allFailed;
    } catch (err) {
      console.error(`[scrape] run failed: ${err instanceof Error ? err.message : String(err)}`);
      lastAllFailed = true;
    }
    if (args.every && !stopping) {
      console.error(`[scrape] next run in ${args.every} min (Ctrl-C to stop)`);
      await new Promise((r) => setTimeout(r, args.every! * 60 * 1000));
    }
  } while (args.every && !stopping);

  await disconnectDb();
  process.exit(lastAllFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
