/**
 * Reclaim storage left behind by the purged WPRDC import: drop dead indexes,
 * drop the empty WPRDC collections, and audit promos/deals (report only).
 * Dry run by default; --apply writes. Idempotent. Does not print MONGODB_URI.
 * Run: npx tsx src/ingest/pruneStorage.ts [--apply]
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { buildPromos } from '../seed/data';

const APPLY = process.argv.includes('--apply');

/**
 * Indexes the purged WPRDC import left behind. Each is dropped only if the live
 * check proves the field is absent or single-valued, so the list is a proposal,
 * not an instruction. No route/repo/service query reads any of these fields
 * (grep src/repo src/routes src/services src/pricing src/matcher) — only the
 * WPRDC ingest scripts do, and those own the `relied on` note below.
 */
const CANDIDATES: { coll: string; index: string; field: string; reliedOnBy?: string }[] = [
  { coll: 'restaurants', index: 'facilityId_1', field: 'facilityId', reliedOnBy: 'wprdcFacilities/Inspections/Violations upsert filter' },
  { coll: 'restaurants', index: 'osmId_1', field: 'osmId' },
  { coll: 'restaurants', index: 'neighborhood_1', field: 'neighborhood' },
  { coll: 'menuItems', index: 'facilityId_1', field: 'facilityId' },
  { coll: 'menuItems', index: 'synthetic_1', field: 'synthetic' },
];

/** WPRDC tables purged by purgeToCollected.ts; the collections may linger empty. */
const EMPTY_COLLECTIONS = ['foodFacilities', 'inspections', 'violations'];

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function indexSizes(coll: string): Promise<Record<string, number>> {
  const s = (await mongoose.connection.db!.command({ collStats: coll })) as {
    indexSizes?: Record<string, number>;
  };
  return s.indexSizes ?? {};
}

async function totals(): Promise<{ dataMB: string; storageMB: string; indexMB: string }> {
  const st = await mongoose.connection.db!.stats();
  return { dataMB: mb(st.dataSize), storageMB: mb(st.storageSize), indexMB: mb(st.indexSize) };
}

async function exists(name: string): Promise<boolean> {
  return (await mongoose.connection.db!.listCollections({ name }).toArray()).length > 0;
}

/** (a) Drop indexes whose field is provably absent or single-valued. */
async function pruneIndexes(): Promise<void> {
  console.log('\n=== (a) dead indexes ===');
  const db = mongoose.connection.db!;
  const drop: { coll: string; index: string }[] = [];

  for (const c of CANDIDATES) {
    const coll = db.collection(c.coll);
    const spec = (await coll.indexes()).find((i) => i.name === c.index);
    if (!spec) {
      console.log(`  ${c.coll}.${c.index}: already absent`);
      continue;
    }
    const sizes = await indexSizes(c.coll);
    const size = kb(sizes[c.index] ?? 0);

    const total = await coll.countDocuments({});
    const present = await coll.countDocuments({ [c.field]: { $exists: true } });
    const values = present > 0 ? await coll.distinct(c.field) : [];
    const sample = JSON.stringify(values.slice(0, 3));
    console.log(
      `  ${c.coll}.${c.index}: ${size} | ${c.field} on ${present}/${total} docs | ` +
        `${values.length} distinct ${sample}${values.length > 3 ? ' ...' : ''}`,
    );

    if (spec.unique === true) {
      console.log(`    SKIP: UNIQUE index — uniqueness is a constraint, not just a lookup.${c.reliedOnBy ? ` Also relied on by ${c.reliedOnBy}.` : ''}`);
      continue;
    }
    if (present > 0 && values.length > 1) {
      console.log(`    SKIP: field is populated and multi-valued — not dead schema. Reclassify by hand.`);
      continue;
    }
    console.log(`    DEAD: ${present === 0 ? 'field absent on every doc' : 'single-valued, no selectivity'} -> drop`);
    drop.push({ coll: c.coll, index: c.index });
  }

  if (drop.length === 0) {
    console.log('  nothing to drop');
    return;
  }
  if (!APPLY) {
    console.log(`  DRY RUN: would drop ${drop.map((d) => `${d.coll}.${d.index}`).join(', ')}`);
    return;
  }
  for (const d of drop) {
    await db.collection(d.coll).dropIndex(d.index);
    console.log(`  dropped ${d.coll}.${d.index}`);
  }
}

/** (b) Drop the WPRDC collections, but only while they are genuinely empty. */
async function pruneEmptyCollections(): Promise<void> {
  console.log('\n=== (b) empty WPRDC collections ===');
  const db = mongoose.connection.db!;
  for (const name of EMPTY_COLLECTIONS) {
    if (!(await exists(name))) {
      console.log(`  ${name}: already absent`);
      continue;
    }
    const n = await db.collection(name).countDocuments({});
    if (n > 0) {
      console.log(`  ${name}: *** SKIP — ${n} documents, NOT empty. Refusing to drop. ***`);
      continue;
    }
    if (!APPLY) {
      console.log(`  ${name}: 0 docs -> DRY RUN: would drop`);
      continue;
    }
    await db.dropCollection(name);
    console.log(`  ${name}: dropped (was 0 docs)`);
  }
}

/** (c) Report only. Deleting promos/deals is the user's call, not this script's. */
async function auditPromosAndDeals(): Promise<void> {
  console.log('\n=== (c) promos / deals audit (REPORT ONLY, nothing deleted) ===');
  const db = mongoose.connection.db!;

  const promos = await db
    .collection('promos')
    .find({}, { projection: { platformSlug: 1, code: 1, description: 1, createdAt: 1 } })
    .toArray();
  const seedCodes = new Set(buildPromos().map((p) => `${p.platformSlug}:${p.code}`));
  const fromSeed = promos.filter((p) => seedCodes.has(`${p.platformSlug}:${p.code}`));
  console.log(`  promos: ${promos.length} docs, ${fromSeed.length} match a code in src/seed/data.ts buildPromos()`);
  for (const p of promos) {
    const tag = seedCodes.has(`${p.platformSlug}:${p.code}`) ? 'SEED' : 'not-in-seed';
    console.log(`    [${tag}] ${p.platformSlug}/${p.code} "${p.description}" created ${String(p.createdAt)}`);
  }

  const deals = await db.collection('deals').find({}).toArray();
  console.log(`  deals: ${deals.length} docs`);
  const tally = (key: string): string => {
    const counts = new Map<string, number>();
    for (const d of deals) {
      const v = String((d as Record<string, unknown>)[key] ?? 'null');
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts].map(([v, n]) => `${v}=${n}`).join(' ');
  };
  if (deals.length > 0) {
    const created = deals.map((d) => String(d.createdAt)).sort();
    console.log(`    firstRunId: ${tally('firstRunId')}`);
    console.log(`    lastRunId:  ${tally('lastRunId')}`);
    console.log(`    platform:   ${tally('platform')}`);
    console.log(`    dealType:   ${tally('dealType')}`);
    console.log(`    isActive:   ${tally('isActive')}`);
    console.log(`    created:    ${created[0]} .. ${created[created.length - 1]}`);
    console.log(`    restaurants: ${[...new Set(deals.map((d) => String(d.restaurantName)))].join(', ')}`);
  }
  console.log('  no promo or deal is deleted by this script — decide, then delete by hand.');
}

async function main(): Promise<void> {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[prune] connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);

  console.log(`\nbefore: ${JSON.stringify(await totals())}`);
  console.log(`  restaurants indexes: ${JSON.stringify(await indexSizes('restaurants'))}`);
  console.log(`  menuItems indexes:   ${JSON.stringify(await indexSizes('menuItems'))}`);

  await pruneIndexes();
  await pruneEmptyCollections();
  await auditPromosAndDeals();

  console.log(`\nafter: ${JSON.stringify(await totals())}`);
  console.log(`  restaurants indexes: ${JSON.stringify(await indexSizes('restaurants'))}`);
  console.log(`  menuItems indexes:   ${JSON.stringify(await indexSizes('menuItems'))}`);
  if (!APPLY) console.log('\n[prune] dry run — nothing was changed. Re-run with --apply to write.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
