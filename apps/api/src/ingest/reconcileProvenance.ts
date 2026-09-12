/**
 * Makes the restaurant provenance labels tell the truth about the purged DB.
 * Dry run by default: `npx tsx src/ingest/reconcileProvenance.ts [--apply]`.
 *
 * purgeToCollected.ts cut the catalogue down to platform-matched listings and
 * left two labels behind, both now misleading:
 *
 * (a) 207 rows still say source:'wprdc'. That stays. It is still true and it is
 *     the only record that the address, seatCount, sqFeet and inspection placard
 *     on those rows are Allegheny County open data. Rewriting source to
 *     'apify-doordash' would read as "this row came from a DoorDash scrape",
 *     which would be a lie about the county fields and would lose the discovery
 *     origin permanently — the scrape can be re-run, the join cannot be undone.
 *     The missing half is the platform match, so that gets its own field:
 *     `observedOn`, the platforms we hold positive evidence for. It is NOT a
 *     restatement of platformIds — platformIds is an id we hold, observedOn is
 *     proof we used it (a platformScrapes row for that id, or menuItems carrying
 *     that observedPlatform). A row can hold a stale id with neither.
 *
 * (b) derivedFields is recomputed per row from what is true NOW, by replaying
 *     the exact formulas wprdcFacilities.ts used and comparing to the stored
 *     value. An entry is dropped only when the current value is positively
 *     proven observed. Anything undecidable — 'cuisine' is a union of a
 *     name-regex guess and the platform's own tags, with no way to tell the
 *     halves apart — is KEPT, so this can never upgrade a guess to observed.
 *
 * (c) The 448 rows apifyPlatforms.ts CREATED carry derivedFields [] yet some of
 *     their values are parser defaults, not payload: `rating || 4`, parseTier()'s
 *     fallback 2, cuisine ['American']. Those fields are ADDED to derivedFields
 *     when the payload itself proves the default fired (parserFallbacks()).
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { MenuItemModel, PlatformScrapeModel, RestaurantModel, unpackPayload } from '../models';
import { unit } from '../seed/data';
import { parseDoorDashStore, parseUberStore } from './apifyPlatforms';

/** The fields whose derived-ness this script can actually decide. */
const DECIDABLE = ['rating', 'ratingCount', 'priceTier', 'sampleItem', 'imageUrl'] as const;

export interface Row {
  slug: string;
  rating?: number | null;
  ratingCount?: number | null;
  priceTier?: number | null;
  seatCount?: number | null;
  sqFeet?: number | null;
  imageUrl?: string | null;
  sampleItem?: { name?: string | null } | null;
  platformIds?: { doordash?: string | null; ubereats?: string | null; grubhub?: string | null } | null;
}

/** Replays wprdcFacilities.ts's guesses for a row. Same keys, same formulas. */
export function derivedGuess(r: Row): { rating: number; ratingCount: number; priceTier: number } {
  const seats = r.seatCount ?? 0;
  const sq = r.sqFeet ?? 0;
  return {
    rating: +(3.2 + unit(`rating:${r.slug}`) * 1.7).toFixed(1),
    ratingCount: 20 + Math.floor(unit(`ratings:${r.slug}`) * 1181),
    priceTier: seats
      ? seats >= 100 ? 3 : seats >= 40 ? 2 : 1
      : sq
        ? sq >= 4000 ? 3 : sq >= 1500 ? 2 : 1
        : Math.floor(unit(`tier:${r.slug}`) * 3) + 1,
  };
}

/**
 * Is `field` STILL a derived guess on this row? Undecidable fields answer true,
 * so the label survives rather than the row claiming an observation it lacks.
 */
export function stillDerived(field: string, r: Row, observedItemNames: Set<string>): boolean {
  const g = derivedGuess(r);
  switch (field) {
    // Derived rows got picsum.photos; a scrape overwrote it with the real CDN.
    case 'imageUrl':
      return !r.imageUrl || r.imageUrl.includes('picsum.photos');
    // Observed iff the sample names a menu item we actually scraped off the store.
    case 'sampleItem':
      return !r.sampleItem?.name || !observedItemNames.has(r.sampleItem.name);
    case 'rating':
      return r.rating === g.rating;
    case 'ratingCount':
      return r.ratingCount === g.ratingCount;
    case 'priceTier':
      return r.priceTier === g.priceTier;
    default:
      return true;
  }
}

/** Platforms with real evidence behind them, not merely an id on the row. */
export function observedPlatforms(
  r: Row,
  scrapeKeys: Set<string>,
  menuPlatforms: Set<string>,
): string[] {
  const out = new Set(menuPlatforms);
  for (const [platform, id] of Object.entries(r.platformIds ?? {})) {
    if (id && scrapeKeys.has(`${platform}:${id}`)) out.add(platform);
  }
  return [...out].sort();
}

/**
 * Fields apifyPlatforms.ts filled from a default rather than the payload, on a
 * row it created. `source` names the creating platform; `payloads` holds every
 * scrape linked to the row, since a later match can overwrite a default rating
 * but never priceTier, and only appends to cuisine.
 */
export function parserFallbacks(source: string | null | undefined, payloads: Map<string, Record<string, unknown>>): string[] {
  const creator = source === 'apify-doordash' ? 'doordash' : source === 'apify-ubereats' ? 'ubereats' : undefined;
  const raw = creator && payloads.get(creator);
  if (!raw) return [];
  const parse = (p: string, v: Record<string, unknown>) => (p === 'doordash' ? parseDoorDashStore(v) : parseUberStore(v));
  const out: string[] = [];
  if (![...payloads].some(([p, v]) => (parse(p, v)?.rating ?? 0) > 0)) out.push('rating');
  // Mirrors parseTier(): a '$' run or 1..3 is read, anything else becomes 2.
  const tier = creator === 'doordash' ? (raw.price_range ?? raw.price_range_display) : raw.priceBucket;
  if (!String(tier ?? '').includes('$') && !(Number(tier) >= 1 && Number(tier) <= 3)) out.push('priceTier');
  if ((parse(creator, raw)?.cuisine.length ?? 0) === 0) out.push('cuisine');
  return out;
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const pad = (v: string | number, w: number): string => String(v).padEnd(w);
const num = (v: string | number, w: number): string => String(v).padStart(w);

async function main(): Promise<void> {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[reconcile] connected to ${mongoose.connection.name} — ${apply ? 'APPLY' : 'DRY RUN'}`);

  const restaurants = await RestaurantModel.find({}).lean();

  // Evidence side: what we actually observed, per restaurant.
  const items = await MenuItemModel.find(
    { synthetic: false },
    { restaurantId: 1, name: 1, observedPlatform: 1 },
  ).lean();
  const namesByRest = new Map<string, Set<string>>();
  const platformsByRest = new Map<string, Set<string>>();
  for (const it of items) {
    const id = String(it.restaurantId);
    let names = namesByRest.get(id);
    if (!names) namesByRest.set(id, (names = new Set()));
    names.add(it.name);
    if (it.observedPlatform) {
      let plats = platformsByRest.get(id);
      if (!plats) platformsByRest.set(id, (plats = new Set()));
      plats.add(it.observedPlatform);
    }
  }
  const scrapes = await PlatformScrapeModel.find({}, { platformSlug: 1, storeId: 1, payload: 1, payloadEncoding: 1 }).lean();
  const payloadByKey = new Map(
    scrapes.map((s) => [`${s.platformSlug}:${s.storeId}`, unpackPayload(s) as Record<string, unknown>]),
  );
  const scrapeKeys = new Set(payloadByKey.keys());

  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const undecidableKept: Record<string, number> = {};
  const fallbackAdded: Record<string, number> = {};
  const observedTally = new Map<string, number>();
  const stillGuessed: Record<string, number> = { rating: 0, ratingCount: 0, priceTier: 0, sampleItem: 0, imageUrl: 0 };
  const examples: Record<string, string[]> = { rating: [], ratingCount: [], priceTier: [], sampleItem: [], imageUrl: [] };
  const ops: Parameters<typeof RestaurantModel.bulkWrite>[0] = [];
  let touched = 0;

  for (const r of restaurants) {
    const id = String(r._id);
    const names = namesByRest.get(id) ?? new Set<string>();
    const row = r as unknown as Row;
    const current = [...(r.derivedFields ?? [])];
    const linked = new Map<string, Record<string, unknown>>();
    for (const [platform, sid] of Object.entries(row.platformIds ?? {})) {
      const payload = sid ? payloadByKey.get(`${platform}:${sid}`) : undefined;
      if (payload) linked.set(platform, payload);
    }
    const fallback = parserFallbacks(r.source, linked);
    // A proven fallback is kept even if the wprdc-formula test says otherwise,
    // so a second run reproduces the same list in the same order.
    const kept = current.filter((f) => {
      if (fallback.includes(f)) return true;
      const keep = stillDerived(f, row, names);
      if (keep && !DECIDABLE.includes(f as (typeof DECIDABLE)[number])) {
        undecidableKept[f] = (undecidableKept[f] ?? 0) + 1;
      }
      return keep;
    });
    const added = fallback.filter((f) => !kept.includes(f));
    for (const f of added) fallbackAdded[f] = (fallbackAdded[f] ?? 0) + 1;
    const next = [...kept, ...added];
    for (const f of current) before[f] = (before[f] ?? 0) + 1;
    for (const f of next) after[f] = (after[f] ?? 0) + 1;

    // (d) report only. Scoped to rows that CLAIM the field is derived: on a row
    // that never ran the guess formula, matching a 3-way priceTier is a 1-in-3
    // coincidence, not evidence. Unlabelled rows are covered by (c) instead.
    for (const f of DECIDABLE) {
      if (current.includes(f) && stillDerived(f, row, names)) {
        stillGuessed[f] += 1;
        if (examples[f].length < 3) examples[f].push(r.slug);
      }
    }

    const observed = observedPlatforms(row, scrapeKeys, platformsByRest.get(id) ?? new Set());
    observedTally.set(
      `${r.source ?? 'null'} -> [${observed.join(', ')}]`,
      (observedTally.get(`${r.source ?? 'null'} -> [${observed.join(', ')}]`) ?? 0) + 1,
    );

    if (same(current, next) && same([...(r.observedOn ?? [])], observed)) continue;
    touched += 1;
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { derivedFields: next, observedOn: observed } } } });
  }

  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  console.log(`\nderivedFields, ${restaurants.length} restaurants`);
  console.log(`  ${pad('field', 14)}${num('before', 8)}${num('after', 8)}${num('change', 9)}  basis`);
  const basis: Record<string, string> = {
    imageUrl: 'real CDN url, not picsum.photos',
    sampleItem: 'names a scraped menuItem on this row',
    rating: 'differs from the 3.2+unit()*1.7 guess',
    ratingCount: 'differs from the 20+unit()*1181 guess',
    priceTier: 'differs from the seats/sqft/unit() guess',
  };
  for (const f of fields) {
    const b = before[f] ?? 0;
    const a = after[f] ?? 0;
    console.log(`  ${pad(f, 14)}${num(b, 8)}${num(a, 8)}${num(a - b, 9)}  ${basis[f] ?? 'UNDECIDABLE — kept as-is'}`);
  }
  console.log(`  added as parser fallbacks on apify-created rows: ${JSON.stringify(fallbackAdded)}`);

  console.log(`\nsource (unchanged) -> observedOn (new)`);
  for (const [k, n] of [...observedTally].sort()) console.log(`  ${pad(k, 46)}${num(n, 6)}`);

  console.log(`\nstill a derived guess — NOT safe to display as real (report only, not fixed)`);
  for (const f of DECIDABLE) {
    const eg = examples[f].length > 0 ? `  e.g. ${examples[f].join(', ')}` : '';
    console.log(`  ${pad(f, 14)}${num(stillGuessed[f], 6)} of ${restaurants.length} rows${eg}`);
  }
  if (Object.keys(undecidableKept).length > 0) {
    console.log(`  kept unverified: ${JSON.stringify(undecidableKept)}`);
  }
  console.log(
    `  Counts cover only rows that already claimed the field was derived; the parser\n` +
    `  fallbacks added above are the only other guesses. The rating test has ~1/18 odds of a real value\n` +
    `  coinciding with the guess, so 'rating' is an upper bound; ratingCount\n` +
    `  (~1/1181) and sampleItem are tight. priceTier is exact: the Apify match path\n` +
    `  never writes priceTier, so every labelled row still holds the original guess.`,
  );

  console.log(`\nrows to update: ${touched} of ${restaurants.length}`);
  if (!apply) {
    console.log('[reconcile] dry run: nothing written. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }
  if (ops.length > 0) {
    const res = await RestaurantModel.bulkWrite(ops);
    console.log(`[reconcile] modified ${res.modifiedCount} restaurants`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
}
