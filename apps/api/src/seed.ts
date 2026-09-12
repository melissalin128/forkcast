/**
 * npm run seed
 *
 * Writes the demo catalog to MongoDB and generates 7 days x hourly
 * PriceSnapshots per restaurant per platform from the mock adapter curves.
 * Idempotent: platforms/restaurants upsert by slug, promos by (platform, code),
 * snapshots by (restaurantId, platformSlug, capturedAt).
 */
import mongoose from 'mongoose';
import { config } from './config';
import { PlatformModel, PriceSnapshotModel, PromoModel, RestaurantModel } from './models';
import { buildPromos, platforms, restaurants } from './seed/data';
import { generateSnapshots } from './seed/snapshots';

const DAYS = Number(process.env.SEED_DAYS ?? 7);

async function main(): Promise<void> {
  if (!config.mongodbUri) {
    console.error('[seed] MONGODB_URI is not set. Copy .env.example to .env at the repo root and fill it in.');
    console.error('[seed] (Without it the API already serves the same catalog from memory: `npm run dev -w apps/api`.)');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[seed] connected to ${mongoose.connection.name}`);

  // platforms
  for (const p of platforms) {
    await PlatformModel.updateOne({ slug: p.slug }, { $set: p }, { upsert: true });
  }
  console.log(`[seed] platforms: ${platforms.length} upserted`);

  // restaurants (by slug)
  const idBySlug = new Map<string, string>();
  for (const r of restaurants) {
    const { id: _id, ...doc } = r;
    const saved = await RestaurantModel.findOneAndUpdate({ slug: r.slug }, { $set: doc }, { upsert: true, new: true }).lean();
    idBySlug.set(r.slug, String(saved!._id));
  }
  console.log(`[seed] restaurants: ${restaurants.length} upserted`);

  // promos (by platform + code) — windows are relative to now so they are live after every seed
  const promos = buildPromos();
  for (const p of promos) {
    await PromoModel.updateOne({ platformSlug: p.platformSlug, code: p.code }, { $set: p }, { upsert: true });
  }
  console.log(`[seed] promos: ${promos.length} upserted`);

  // snapshots (7 days x 24 h x platforms)
  const snapshots = generateSnapshots(restaurants, { days: DAYS, idFor: (r) => idBySlug.get(r.slug)! });
  const BATCH = 1000;
  let upserted = 0;
  for (let i = 0; i < snapshots.length; i += BATCH) {
    const batch = snapshots.slice(i, i + BATCH);
    const result = await PriceSnapshotModel.bulkWrite(
      batch.map((s) => ({
        updateOne: {
          filter: { restaurantId: new mongoose.Types.ObjectId(s.restaurantId), platformSlug: s.platformSlug, capturedAt: s.capturedAt },
          update: { $setOnInsert: { ...s, restaurantId: new mongoose.Types.ObjectId(s.restaurantId) } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    upserted += result.upsertedCount;
    process.stdout.write(`\r[seed] snapshots: ${Math.min(i + BATCH, snapshots.length)}/${snapshots.length} processed`);
  }
  console.log(`\n[seed] snapshots: ${upserted} new, ${snapshots.length - upserted} already present`);

  await PriceSnapshotModel.syncIndexes();
  await PromoModel.syncIndexes();
  await mongoose.disconnect();
  console.log('[seed] done');
}

main().catch(async (err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
