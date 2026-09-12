/**
 * npm run scrape:seed [-- --zip 15213 --queries "pizza,boba" --limit 8 --pause 5]
 *
 * Populates the database with real prices instead of the demo catalog: one
 * scrape job per (zip, query), run sequentially through the same adapters the
 * API uses (ADAPTER / ADAPTER_<PLATFORM>), reusing browsers and Apify search
 * caches across queries. Platform metadata (names, brand colors) is upserted
 * first, so a fresh database is fully usable when this finishes.
 *
 *   --zips 15213,15217   one job per zip per query          (default 15213)
 *   --queries a,b,c      search terms                       (default COMMON_QUERIES)
 *   --platforms d,u,g    subset of doordash,ubereats,grubhub
 *   --limit 8            listings kept per platform per search
 *   --pause 5            seconds between jobs (be gentle on the sites)
 *   --json               print every job result as JSON
 *
 * Each query costs one Apify search run per apify-mode platform; the count is
 * printed before anything starts. Exit code is non-zero when every job failed.
 */
import mongoose from 'mongoose';
import { closeAdapters, createAdapters, platformMode } from './adapters';
import { connectDb, disconnectDb } from './db';
import { PlatformModel } from './models';
import { PLATFORM_SLUGS, type PlatformSlug } from './models/types';
import { platforms as platformSeed } from './seed/data';
import { formatTable, runScrapeJob, type ScrapeResult } from './services/scrapeJob';

const COMMON_QUERIES = ['pizza', 'boba', 'fast food', 'burgers', 'sushi', 'chinese', 'mexican', 'thai'];

interface Args {
  zips: string[];
  queries: string[];
  platforms: PlatformSlug[];
  limit: number;
  pause: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    const [, inline] = argv[i].split('=');
    return inline ?? argv[i + 1];
  };
  const csv = (raw: string | undefined): string[] =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const zips = csv(get('zips') ?? get('zip')).length ? csv(get('zips') ?? get('zip')) : ['15213'];
  for (const z of zips) if (!/^\d{5}$/.test(z)) throw new Error(`--zips must be 5-digit codes (got "${z}")`);
  const queries = csv(get('queries') ?? get('q'));
  const platforms = csv(get('platforms'))
    .map((s) => s.toLowerCase().replace(/[^a-z]/g, ''))
    .filter((s): s is PlatformSlug => (PLATFORM_SLUGS as string[]).includes(s));
  return {
    zips,
    queries: queries.length ? queries : COMMON_QUERIES,
    platforms: platforms.length ? platforms : [...PLATFORM_SLUGS],
    limit: Math.max(1, Number(get('limit') ?? 8) || 8),
    pause: Math.max(0, Number(get('pause') ?? 5) || 0),
    json: argv.includes('--json'),
  };
}

/** Same upsert as npm run seed, but only the platform docs — no demo restaurants or fake history. */
async function seedPlatformMeta(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return; // memory repo seeds itself
  for (const p of platformSeed) {
    await PlatformModel.updateOne({ slug: p.slug }, { $set: p }, { upsert: true });
  }
  console.error(`[seed-scrape] platform metadata upserted (${platformSeed.map((p) => p.slug).join(', ')})`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const jobs = args.zips.flatMap((zip) => args.queries.map((q) => ({ zip, q })));
  const apifyPlatforms = args.platforms.filter((p) => platformMode(p) === 'apify');
  console.error(
    `[seed-scrape] ${jobs.length} jobs (${args.zips.join(', ')} x ${args.queries.length} queries), ` +
      `platforms: ${args.platforms.map((p) => `${p}=${platformMode(p)}`).join(' ')}` +
      (apifyPlatforms.length ? ` — about ${jobs.length * apifyPlatforms.length} Apify search runs will be started` : ''),
  );

  const repo = await connectDb();
  await seedPlatformMeta();
  const adapters = createAdapters();

  let stopping = false;
  const stop = () => {
    stopping = true;
    console.error('\n[seed-scrape] stopping after the current job…');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const restaurants = new Set<string>();
  const offers: Partial<Record<PlatformSlug, number>> = {};
  const failures: string[] = [];

  try {
    for (let i = 0; i < jobs.length && !stopping; i += 1) {
      const { zip, q } = jobs[i];
      console.error(`\n[seed-scrape] (${i + 1}/${jobs.length}) "${q}" near ${zip}`);
      let result: ScrapeResult;
      try {
        result = await runScrapeJob({ zip, q, platforms: args.platforms, limit: args.limit, repo, adapters, log: (line) => console.error(line) });
      } catch (err) {
        failures.push(`${q} near ${zip}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const row of result.rows) restaurants.add(row.slug);
      for (const p of args.platforms) {
        const s = result.platforms[p];
        if (!s) continue;
        offers[p] = (offers[p] ?? 0) + s.offers;
        if (!s.ok) failures.push(`${q} near ${zip} [${p}]: ${s.error}`);
      }
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else console.log(formatTable(result));
      if (args.pause && i < jobs.length - 1 && !stopping) await new Promise((r) => setTimeout(r, args.pause * 1000));
    }
  } finally {
    await closeAdapters(adapters);
    await disconnectDb();
  }

  console.error(`\n[seed-scrape] done: ${restaurants.size} restaurants, offers ${args.platforms.map((p) => `${p}=${offers[p] ?? 0}`).join(' ')}`);
  if (failures.length) {
    console.error(`[seed-scrape] ${failures.length} failures:`);
    for (const f of failures) console.error(`  - ${f}`);
  }
  const totalOffers = Object.values(offers).reduce((a, b) => a + b, 0);
  process.exit(totalOffers > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
