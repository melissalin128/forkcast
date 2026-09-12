/**
 * SYNTHETIC price history — the volume driver of the ingest
 * (`npm run ingest` / generateSnapshots({ targetGB })).
 *
 * Forkcast is a price-comparison-over-time product, so its naturally large
 * table is the time series of what every restaurant costs on every platform:
 * (each Restaurant) x 3 platform slugs x one sample per hour, walking backwards
 * from now. That is what takes the database to the multi-GB target, and it is
 * domain-correct data rather than padding — /pricing/bestWindow reads exactly
 * this shape.
 *
 * These are MODELLED prices, not observed platform prices. Nothing here is
 * scraped or fetched: every field is a deterministic function of
 * unit(slug + platform + isoHour), shaped like real delivery economics
 * (per-platform fee structure and markup, lunch/dinner peaks, busier weekends,
 * occasional promo windows, ETAs that widen with demand). Re-running is safe:
 * the unique index on (restaurantId, platformSlug, capturedAt) rejects the
 * repeats and we count the real inserts and carry on. Every row written here
 * is labelled: PriceSnapshot.source defaults to 'modelled', so a reader can
 * always separate these from the real partner-API quotes liveQuotes.ts writes.
 */
import type { Types } from 'mongoose';
import { PriceSnapshotModel, RestaurantModel } from '../models';
import { round2 } from '../pricing/computeTotal';
import { unit } from '../seed/data';
import { dbSizeGB, done, tick } from './common';

/**
 * INVENTED per-platform fee structure (base delivery fee, menu markup, surge
 * headroom). Plausible shapes, not the platforms' published or observed fees.
 */
const PLATFORMS = [
  { slug: 'doordash', fee: 2.99, markup: 1.1, surge: 1.8 },
  { slug: 'ubereats', fee: 3.49, markup: 1.14, surge: 2.2 },
  { slug: 'grubhub', fee: 1.99, markup: 1.06, surge: 1.4 },
] as const;

const TIER_MULT = { 1: 0.85, 2: 1, 3: 1.35 } as const;

/** 0 (dead) .. ~1.2 (Saturday dinner): lunch and dinner peaks, busier weekends. */
function demand(at: Date): number {
  const h = at.getHours();
  const hourly =
    h >= 17 && h <= 20 ? 1 // dinner
    : h >= 11 && h <= 13 ? 0.85 // lunch
    : h >= 21 && h <= 23 ? 0.45
    : h >= 8 && h <= 16 ? 0.3
    : 0.08; // overnight
  const day = at.getDay();
  const weekly = day === 0 || day === 6 ? 1.18 : day === 5 ? 1.1 : 0.95;
  return Math.min(1.2, hourly * weekly);
}

interface Priced {
  total: number;
  deliveryFee: number;
  etaMin: number;
  promoApplied: boolean;
}

/**
 * One modelled quote. Exported for the unit test; deterministic in
 * (slug, platform, isoHour) so a re-run reproduces the same row.
 */
export function quote(
  slug: string,
  menuPrice: number,
  priceTier: 1 | 2 | 3,
  platform: (typeof PLATFORMS)[number],
  at: Date,
  isoHour: string,
): Priced {
  const key = slug + platform.slug + isoHour;
  const u = unit(key); // fee/price jitter
  const v = unit(`eta:${key}`); // independent ETA jitter
  const d = demand(at);

  const subtotal = menuPrice * TIER_MULT[priceTier] * platform.markup;
  const deliveryFee = Math.max(0, round2(platform.fee + platform.surge * d + (u - 0.5) * 0.8));
  const serviceFee = subtotal * (0.12 + 0.04 * d);
  const tax = subtotal * 0.07;
  const promoApplied = unit(`promo:${key}`) < 0.1; // ~10% of hours sit in a promo window

  let total = subtotal + serviceFee + deliveryFee + tax;
  if (promoApplied) total *= 0.85;

  return {
    total: round2(total),
    deliveryFee,
    etaMin: Math.round(18 + 26 * d + (v - 0.5) * 8),
    promoApplied,
  };
}

interface Lean {
  _id: Types.ObjectId;
  slug: string;
  priceTier: 1 | 2 | 3;
  sampleItem?: { menuPrice?: number };
}

/** MongoDB duplicate-key code. A re-run replays the same hours and hits the unique index. */
const DUP_KEY = 11000;

/** Shape of the error insertMany({ordered:false}) throws. */
interface BulkErr {
  code?: number;
  /** Mongoose re-spreads the driver's WriteError, which drops the `code` getter onto `err`. */
  writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
  insertedDocs?: unknown[];
}

/**
 * How many of a bulk error's writes were duplicate keys, or -1 when anything
 * else went wrong. Decides crash-vs-carry-on on every re-run, so it is exported
 * for the unit test.
 */
export function dupCount(err: unknown): number {
  const e = err as BulkErr;
  const errs = e.writeErrors;
  const dupes = errs
    ? errs.filter((w) => (w.err?.code ?? w.code) === DUP_KEY).length
    : e.code === DUP_KEY
      ? 1
      : 0;
  // Only duplicate keys are expected; anything else (a cast failure, a
  // write-concern or storage error) is real and must not be miscounted as
  // "already there".
  return dupes > 0 && dupes === (errs?.length ?? 1) ? dupes : -1;
}

export async function generateSnapshots(opts: {
  targetGB: number;
  days?: number;
  batch?: number;
}): Promise<{ inserted: number; sizeGB: number }> {
  const label = 'snapshots';
  const days = opts.days ?? 120;
  const batchSize = opts.batch ?? 5000;

  const restaurants = await RestaurantModel.find(
    {},
    { slug: 1, priceTier: 1, 'sampleItem.menuPrice': 1 },
  ).lean<Lean[]>();
  if (restaurants.length === 0) {
    done(label, 'no restaurants — run the catalogue ingest first');
    return { inserted: 0, sizeGB: await dbSizeGB() };
  }

  const hours = days * 24;
  const estimate = restaurants.length * PLATFORMS.length * hours;
  const startSize = await dbSizeGB();
  let sizeGB = startSize;
  let inserted = 0;
  let produced = 0;
  let batches = 0;
  let docs: Record<string, unknown>[] = [];

  const flush = async (): Promise<boolean> => {
    if (docs.length === 0) return false;
    try {
      const r = await PriceSnapshotModel.insertMany(docs, { ordered: false });
      inserted += r.length;
    } catch (err) {
      const dupes = dupCount(err);
      if (dupes < 0) throw err;
      inserted += (err as BulkErr).insertedDocs?.length ?? docs.length - dupes;
    }
    docs = [];
    batches += 1;
    tick(label, produced, estimate);
    // stats() is not free: only sample it every ~20 batches.
    if (batches % 20 === 0) {
      sizeGB = await dbSizeGB();
      if (sizeGB >= opts.targetGB) return true;
    }
    return false;
  };

  // Hour-major so an early stop still leaves every restaurant covered over the
  // same (most recent) window rather than a few restaurants with all the history.
  const top = new Date();
  top.setMinutes(0, 0, 0);
  for (let h = 0; h < hours; h += 1) {
    const at = new Date(top.getTime() - h * 3600_000);
    const isoHour = at.toISOString().slice(0, 13);
    for (const r of restaurants) {
      const menuPrice = r.sampleItem?.menuPrice ?? 12;
      for (const p of PLATFORMS) {
        const q = quote(r.slug, menuPrice, r.priceTier, p, at, isoHour);
        docs.push({
          restaurantId: r._id,
          platformSlug: p.slug,
          total: q.total,
          deliveryFee: q.deliveryFee,
          etaMin: q.etaMin,
          promoApplied: q.promoApplied,
          capturedAt: at,
        });
        produced += 1;
        if (docs.length >= batchSize && (await flush())) {
          done(label, `${inserted.toLocaleString()} snapshots inserted, db at ${sizeGB.toFixed(2)} GB (target ${opts.targetGB} GB reached)`);
          return { inserted, sizeGB };
        }
      }
    }
  }

  await flush();
  sizeGB = await dbSizeGB();
  if (sizeGB < opts.targetGB) {
    // Escape hatch: the full cartesian product is exhausted and we are short.
    const gained = sizeGB - startSize;
    const needDays = gained > 0 ? Math.ceil((days * (opts.targetGB - startSize)) / gained) : 0;
    done(
      label,
      `SHORT of target: ${inserted.toLocaleString()} snapshots, db at ${sizeGB.toFixed(2)} GB of ${opts.targetGB} GB. ` +
        `${days} days x ${restaurants.length} restaurants x ${PLATFORMS.length} platforms is exhausted; ` +
        (needDays > 0
          ? `re-run with days=${needDays} (or ingest more restaurants) to reach the target.`
          : 'no size gain measured — check the connection.'),
    );
  } else {
    done(label, `${inserted.toLocaleString()} snapshots inserted, db at ${sizeGB.toFixed(2)} GB`);
  }
  return { inserted, sizeGB };
}
