/**
 * `npm run ingest -- [--target-gb 4] [--days 120] [--menu-items 60]`
 *                 `[--only facilities,inspections,violations,osm,menus,snapshots]`
 *                 `[--skip ...] [--no-promote] [--dry-run]`
 *
 * Runs the open-data ingest stages in order. The order matters: facilities is
 * what creates the Restaurant rows every later stage enriches.
 *
 *   facilities -> inspections -> violations -> osm -> menus -> snapshots
 *
 * `livequotes` (official DoorDash Drive / Uber Direct partner APIs) is opt-in
 * because it needs credentials: `npm run ingest -- --only livequotes`.
 *
 * Every stage is idempotent, so a re-run or a resumed run is safe. `--dry-run`
 * reports what each stage would do and writes nothing. Exit code is non-zero if
 * any stage threw.
 */
import mongoose from 'mongoose';
import {
  FoodFacilityModel,
  InspectionModel,
  MenuItemModel,
  OfferModel,
  PlatformScrapeModel,
  PriceSnapshotModel,
  RestaurantModel,
  ViolationModel,
} from '../models';
import { WPRDC, ckanTotal, connect, dbSizeGB } from './common';
import { ingestLiveQuotes } from './liveQuotes';
import { generateMenus } from './menus';
import { ingestOsm } from './osm';
import { generateSnapshots } from './snapshots';
import { ingestApifyDatasets } from './apifyPlatforms';
import { ingestFacilities } from './wprdcFacilities';
import { ingestInspections } from './wprdcInspections';
import { ingestViolations } from './wprdcViolations';

const USAGE = `npm run ingest -- [--target-gb 4] [--days 120] [--menu-items 60]
                  [--only facilities,inspections,violations,osm,menus,snapshots,apify]
                  [--skip ...] [--no-promote] [--dry-run]
                  [--doordash-dataset ID] [--ubereats-dataset ID]

  --target-gb N   stop generating price snapshots once the db reaches N GB (default 4)
  --days N        days of hourly price history to generate (default 120)
  --menu-items N  synthetic menu items per restaurant (default 60)
  --only a,b      run only these stages, in the default order
  --skip a,b      run everything except these stages
  --no-promote    ingest facilities without promoting them into restaurants
  --dry-run       report what each stage would do; write nothing
  --doordash-dataset / --ubereats-dataset
                  Apify dataset ids for the cheaper DoorDash / Uber Eats actors

Stages run in this order: facilities, inspections, violations, osm, menus, snapshots.
'livequotes' and 'apify' are opt-in and need credentials.`;

interface Args {
  targetGB: number;
  days: number;
  menuItems: number;
  only?: string[];
  skip: string[];
  promote: boolean;
  dryRun: boolean;
}

interface Stage {
  name: string;
  /** One line describing what a real run would do. Must not write. */
  plan: (a: Args) => Promise<string>;
  run: (a: Args) => Promise<{ rows: number; note: string }>;
}

const n = (v: number): string => v.toLocaleString();

/** Default order — facilities first, because it creates the restaurants. */
const STAGES: Stage[] = [
  {
    name: 'facilities',
    plan: async (a) => {
      const total = await ckanTotal(WPRDC.facilities);
      return `upsert ${n(total)} WPRDC facility rows -> foodFacilities` +
        (a.promote ? ', open eating places promoted into restaurants' : ', no promotion (--no-promote)');
    },
    run: async (a) => {
      const r = await ingestFacilities({ promote: a.promote });
      return { rows: r.facilities, note: `${n(r.promoted)} promoted to restaurants` };
    },
  },
  {
    name: 'inspections',
    plan: async () => `upsert ${n(await ckanTotal(WPRDC.inspections))} WPRDC inspection rows -> inspections, latest placard onto each restaurant`,
    run: async () => {
      const r = await ingestInspections();
      return { rows: r.inspections, note: `${n(r.linked)} restaurants linked` };
    },
  },
  {
    name: 'violations',
    plan: async () => `upsert ${n(await ckanTotal(WPRDC.violations))} WPRDC violation rows -> violations, violation count onto each restaurant`,
    run: async () => {
      const r = await ingestViolations();
      return { rows: r.violations, note: `${n(r.linked)} restaurants linked` };
    },
  },
  {
    name: 'osm',
    // Counting POIs costs the same Overpass call as doing the work, so this
    // stays an estimate rather than a wasted query against a public mirror.
    plan: async () => 'query OpenStreetMap Overpass for food POIs in the Pittsburgh bbox and match them to promoted restaurants (cuisine, diet, hours, contact)',
    run: async () => {
      const r = await ingestOsm();
      return { rows: r.matched, note: `${n(r.pois)} POIs seen` };
    },
  },
  {
    name: 'menus',
    plan: async (a) => {
      const rests = await RestaurantModel.countDocuments({ source: 'wprdc' });
      return `generate up to ${n(rests * a.menuItems)} SYNTHETIC menu items (${n(rests)} restaurants x ${a.menuItems})`;
    },
    run: async (a) => {
      const r = await generateMenus({ perRestaurant: a.menuItems });
      return { rows: r.items, note: 'synthetic' };
    },
  },
  {
    name: 'snapshots',
    plan: async (a) => {
      const rests = await RestaurantModel.countDocuments({});
      return `generate up to ${n(rests * 3 * a.days * 24)} SYNTHETIC price snapshots ` +
        `(${n(rests)} restaurants x 3 platforms x ${a.days} days hourly), stopping at ${a.targetGB} GB`;
    },
    run: async (a) => {
      const r = await generateSnapshots({ targetGB: a.targetGB, days: a.days });
      return { rows: r.inserted, note: `synthetic; db at ${r.sizeGB.toFixed(2)} GB` };
    },
  },
  {
    name: 'livequotes',
    plan: async () => 'quote real delivery fees from the official DoorDash Drive / Uber Direct partner APIs (skipped without credentials)',
    run: async () => {
      const r = await ingestLiveQuotes({});
      return { rows: r.quoted, note: r.skipped.length > 0 ? `skipped: ${r.skipped.join('; ')}` : 'all platforms quoted' };
    },
  },
  {
    name: 'apify',
    plan: async () => 'upsert DoorDash + Uber Eats Apify datasets (observed menus, labeled; needs APIFY_TOKEN + dataset ids)',
    run: async () => {
      const r = await ingestApifyDatasets({});
      return { rows: r.scrapes, note: `${r.restaurants} restaurants, ${r.menuItems} menu items, ${r.snapshots} observed snapshots` };
    },
  },
];

/** Opt-in only: partner APIs or paid Apify actors. */
const OPT_IN = new Set(['livequotes', 'apify']);

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    const [, inline] = argv[i].split('=');
    return inline ?? argv[i + 1];
  };
  const has = (name: string): boolean => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const list = (name: string): string[] | undefined => {
    const raw = get(name);
    if (raw === undefined) return undefined;
    const names = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const unknown = names.filter((x) => !STAGES.some((s) => s.name === x));
    if (unknown.length > 0) {
      throw new Error(`--${name}: unknown stage ${unknown.join(', ')} (known: ${STAGES.map((s) => s.name).join(', ')})`);
    }
    return names;
  };
  const number = (name: string, fallback: number): number => {
    const raw = get(name);
    if (raw === undefined) return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`--${name} must be a positive number (got "${raw}")`);
    return v;
  };

  return {
    targetGB: number('target-gb', 4),
    days: Math.floor(number('days', 120)),
    menuItems: Math.floor(number('menu-items', 60)),
    only: list('only'),
    skip: list('skip') ?? [],
    promote: !has('no-promote'),
    dryRun: has('dry-run'),
  };
}

function select(a: Args): Stage[] {
  const wanted = a.only
    ? STAGES.filter((s) => a.only!.includes(s.name))
    : STAGES.filter((s) => !OPT_IN.has(s.name));
  return wanted.filter((s) => !a.skip.includes(s.name));
}

function elapsed(ms: number): string {
  return ms < 60_000
    ? `${(ms / 1000).toFixed(1)}s`
    : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const stages = select(args);
  if (stages.length === 0) throw new Error('nothing to run: --only/--skip excluded every stage');

  await connect();

  if (args.dryRun) {
    console.log(`[ingest] DRY RUN — nothing will be written\n`);
    for (const st of stages) console.log(`  ${st.name.padEnd(12)} would ${await st.plan(args)}`);
    console.log(`\n[ingest] db currently at ${(await dbSizeGB()).toFixed(2)} GB`);
    await mongoose.disconnect();
    return;
  }

  // Build indexes before the bulk writes: cheap now, and the snapshot inserts
  // depend on the unique (restaurantId, platformSlug, capturedAt) key existing.
  await Promise.all([
    FoodFacilityModel.syncIndexes(),
    InspectionModel.syncIndexes(),
    ViolationModel.syncIndexes(),
    MenuItemModel.syncIndexes(),
    PriceSnapshotModel.syncIndexes(),
    RestaurantModel.syncIndexes(),
    OfferModel.syncIndexes(),
    PlatformScrapeModel.syncIndexes(),
  ]);
  console.log(`[ingest] indexes synced; running ${stages.map((s) => s.name).join(' -> ')}`);

  const results: Array<{ name: string; rows: number; ms: number; note: string; failed: boolean }> = [];
  for (const st of stages) {
    const t0 = Date.now();
    try {
      const r = await st.run(args);
      results.push({ name: st.name, ...r, ms: Date.now() - t0, failed: false });
    } catch (err) {
      // Keep going: a failed stage leaves the earlier ones' data in place, and
      // the summary below says exactly which one to re-run.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n[${st.name}] FAILED: ${msg}`);
      results.push({ name: st.name, rows: 0, ms: Date.now() - t0, note: msg, failed: true });
    }
  }

  console.log('\nstage         rows        elapsed   detail');
  for (const r of results) {
    const rows = r.failed ? 'FAILED' : n(r.rows);
    console.log(`${r.name.padEnd(13)} ${rows.padStart(11)} ${elapsed(r.ms).padStart(8)}   ${r.note}`);
  }
  console.log(`\n[ingest] database at ${(await dbSizeGB()).toFixed(2)} GB`);

  await mongoose.disconnect();
  if (results.some((r) => r.failed)) process.exit(1);
}

main().catch(async (err) => {
  console.error(`[ingest] ${err instanceof Error ? err.message : err}`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
