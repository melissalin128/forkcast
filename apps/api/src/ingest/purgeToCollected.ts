/**
 * One-off: keep today's collected DoorDash/Uber (Apify) + Grubhub identity.
 * Deletes seed/WPRDC filler, synthetic menus, modelled snapshots, WPRDC tables.
 * Dry run by default; --apply deletes. Does not print MONGODB_URI.
 * Run: npx tsx src/ingest/purgeToCollected.ts [--apply]
 */
import mongoose from 'mongoose';
import { config } from '../config';
import {
  MenuItemModel,
  OfferModel,
  PlatformScrapeModel,
  PriceSnapshotModel,
  RestaurantModel,
} from '../models';
import { matchKey } from '../matcher/restaurantMatcher';

/** Seed catalog used synthetic ids: dd-1234567 / ue-deadbeef / gh-123456. */
function isSeedPlatformId(platform: 'doordash' | 'ubereats' | 'grubhub', id: string | undefined): boolean {
  if (!id) return true;
  if (platform === 'doordash') return /^dd-\d+$/.test(id);
  if (platform === 'ubereats') return /^ue-[0-9a-f]+$/i.test(id);
  return /^gh-\d+$/.test(id);
}

async function collCounts(): Promise<Record<string, { n: number; sizeMB: number }>> {
  const db = mongoose.connection.db!;
  const cols = await db.listCollections().toArray();
  const out: Record<string, { n: number; sizeMB: number }> = {};
  for (const c of cols) {
    const s = (await db.command({ collStats: c.name })) as { count?: number; size?: number };
    out[c.name] = { n: s.count ?? 0, sizeMB: Number(((s.size ?? 0) / 1024 / 1024).toFixed(2)) };
  }
  return out;
}

async function dbGb(): Promise<{ dataGB: number; storageGB: number; objects: number }> {
  const st = await mongoose.connection.db!.stats();
  return {
    dataGB: Number((st.dataSize / 1024 ** 3).toFixed(3)),
    storageGB: Number((st.storageSize / 1024 ** 3).toFixed(3)),
    objects: st.objects,
  };
}

async function main(): Promise<void> {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[purge] connected to ${mongoose.connection.name}`);

  const beforeCounts = await collCounts();
  const beforeGb = await dbGb();
  console.log(JSON.stringify({ phase: 'before', ...beforeGb, collections: beforeCounts }, null, 2));

  const scrapes = await PlatformScrapeModel.find({}, { platformSlug: 1, storeId: 1 }).lean();
  const scrapeKeys = new Set(scrapes.map((s) => `${s.platformSlug}:${s.storeId}`));

  const ghScrapeIds = new Set(
    scrapes.filter((s) => s.platformSlug === 'grubhub').map((s) => s.storeId),
  );
  const ghOffers = await OfferModel.find(
    { platformSlug: 'grubhub' },
    { restaurantId: 1, platformRestaurantId: 1 },
  ).lean();
  const ghOfferKeep = ghOffers
    .filter((o) => {
      const pid = String(o.platformRestaurantId ?? '');
      return pid.length > 0 && (!isSeedPlatformId('grubhub', pid) || ghScrapeIds.has(pid));
    })
    .map((o) => String(o.restaurantId));
  const ghMenuIds = await MenuItemModel.distinct('restaurantId', { observedPlatform: 'grubhub', synthetic: false });
  const ghLinked = new Set([...ghOfferKeep, ...ghMenuIds.map((id) => String(id))]);

  const restaurants = await RestaurantModel.find(
    {},
    { name: 1, address: 1, source: 1, platformIds: 1, slug: 1 },
  ).lean();

  const keep = new Set<string>();
  const reason: Record<string, string> = {};

  for (const r of restaurants) {
    const id = String(r._id);
    const src = String(r.source ?? 'seed');
    const ids = r.platformIds ?? {};
    const dd = ids.doordash;
    const ue = ids.ubereats;
    const gh = ids.grubhub;
    const realDd = Boolean(dd && (!isSeedPlatformId('doordash', dd) || scrapeKeys.has(`doordash:${dd}`)));
    const realUe = Boolean(ue && (!isSeedPlatformId('ubereats', ue) || scrapeKeys.has(`ubereats:${ue}`)));
    const realGh = Boolean(gh && (!isSeedPlatformId('grubhub', gh) || scrapeKeys.has(`grubhub:${gh}`)));
    const scrapeHit = Boolean(
      (dd && scrapeKeys.has(`doordash:${dd}`)) ||
      (ue && scrapeKeys.has(`ubereats:${ue}`)) ||
      (gh && scrapeKeys.has(`grubhub:${gh}`)),
    );

    if (src.startsWith('apify-')) {
      keep.add(id);
      reason[id] = `source:${src}`;
      continue;
    }
    if (realDd || realUe || scrapeHit) {
      keep.add(id);
      reason[id] = realDd && realUe ? 'real-dd+ue' : realDd ? 'real-doordash' : realUe ? 'real-ubereats' : 'scrape-id';
      continue;
    }
    if (realGh || ghLinked.has(id)) {
      keep.add(id);
      reason[id] = realGh ? 'real-grubhub' : 'grubhub-linked';
    }
  }

  // Prefer Apify documents over leftover seed rows for the same physical place.
  const apifyByKey = new Map<string, string>();
  for (const r of restaurants) {
    const id = String(r._id);
    if (!keep.has(id)) continue;
    if (!String(r.source ?? '').startsWith('apify-')) continue;
    apifyByKey.set(matchKey(r.name, r.address), id);
  }
  let demotedSeed = 0;
  for (const r of restaurants) {
    const id = String(r._id);
    if (!keep.has(id)) continue;
    const src = String(r.source ?? 'seed');
    if (src.startsWith('apify-')) continue;
    const twin = apifyByKey.get(matchKey(r.name, r.address));
    if (!twin || twin === id) continue;
    keep.delete(id);
    demotedSeed += 1;
    reason[id] = `dropped-seed-duplicate-of-${twin}`;
  }

  const keepIds = [...keep].map((id) => new mongoose.Types.ObjectId(id));
  const observedMenuCount = await MenuItemModel.countDocuments({
    restaurantId: { $in: keepIds },
    synthetic: false,
  });
  const keepWithObserved = new Set<string>();
  if (keepIds.length > 0) {
    const withMenus = await MenuItemModel.distinct('restaurantId', {
      restaurantId: { $in: keepIds },
      synthetic: false,
    });
    for (const id of withMenus) keepWithObserved.add(String(id));
  }

  // Seed/WPRDC updated in place: require real platform id AND observed menus,
  // unless they are Grubhub-only identity (offers/menus/scrapes).
  let demotedNoMenu = 0;
  for (const r of restaurants) {
    const id = String(r._id);
    if (!keep.has(id)) continue;
    const src = String(r.source ?? 'seed');
    if (src.startsWith('apify-')) continue;
    if (reason[id] === 'grubhub-linked' || reason[id] === 'real-grubhub') continue;
    if (keepWithObserved.has(id)) continue;
    keep.delete(id);
    demotedNoMenu += 1;
    reason[id] = 'dropped-no-observed-menu';
  }

  const keepFinal = [...keep];
  const keepObjIds = keepFinal.map((id) => new mongoose.Types.ObjectId(id));
  const dropIds = restaurants.filter((r) => !keep.has(String(r._id))).map((r) => r._id);

  const byReason: Record<string, number> = {};
  for (const id of keepFinal) {
    const key = reason[id] ?? 'unknown';
    byReason[key] = (byReason[key] ?? 0) + 1;
  }
  const dropBySource: Record<string, number> = {};
  for (const r of restaurants) {
    if (keep.has(String(r._id))) continue;
    const src = String(r.source ?? 'seed');
    dropBySource[src] = (dropBySource[src] ?? 0) + 1;
  }

  const keptDocs = restaurants.filter((r) => keep.has(String(r._id)));
  const grubhubIds = keptDocs.filter((r) => Boolean(r.platformIds?.grubhub)).length;
  const realGrubhubIds = keptDocs.filter(
    (r) => r.platformIds?.grubhub && !isSeedPlatformId('grubhub', r.platformIds.grubhub),
  ).length;

  console.log(JSON.stringify({
    phase: 'plan',
    restaurantsTotal: restaurants.length,
    keep: keepFinal.length,
    drop: dropIds.length,
    demotedSeed,
    demotedNoMenu,
    keepByReason: byReason,
    dropBySource,
    observedMenusOnKeep: observedMenuCount,
    scrapes: scrapes.length,
    keptWithGrubhubField: grubhubIds,
    keptWithRealGrubhubId: realGrubhubIds,
    ghLinkedRestaurants: ghLinked.size,
    ghScrapes: ghScrapeIds.size,
  }, null, 2));

  // Deletes by default would be one typo from irreversible loss: require --apply.
  if (!process.argv.includes('--apply')) {
    console.log('[purge] dry run: no deletes. Re-run with --apply to delete.');
    await mongoose.disconnect();
    return;
  }

  if (dropIds.length > 0) {
    const delR = await RestaurantModel.deleteMany({ _id: { $in: dropIds } });
    console.log(`[purge] restaurants deleted: ${delR.deletedCount}`);
  }

  const syn = await MenuItemModel.deleteMany({ synthetic: true });
  console.log(`[purge] synthetic menuItems: ${syn.deletedCount}`);
  const orphanMenus = await MenuItemModel.deleteMany({ restaurantId: { $nin: keepObjIds } });
  console.log(`[purge] orphan/non-kept menuItems: ${orphanMenus.deletedCount}`);

  const orphanOffers = await OfferModel.deleteMany({ restaurantId: { $nin: keepObjIds } });
  console.log(`[purge] orphan/non-kept offers: ${orphanOffers.deletedCount}`);

  const db = mongoose.connection.db!;
  // Keep only collected Apify DD/UE snapshots + non-modelled Grubhub ones.
  // Extract-then-drop avoids 16M point-deletes locking Atlas.
  const keepIdSet = new Set(keepFinal);
  const apifySnaps = await PriceSnapshotModel.find({
    source: { $in: ['apify-doordash', 'apify-ubereats'] },
  }).lean();
  const unlabeled = await PriceSnapshotModel.find({
    source: { $exists: false },
    platformSlug: 'grubhub',
  }).lean();
  const keepSnaps = [...apifySnaps, ...unlabeled].filter((s) => keepIdSet.has(String(s.restaurantId)));
  console.log(`[purge] keeping ${keepSnaps.length.toLocaleString()} collected snapshots; dropping priceSnapshots`);
  const snapExists = (await db.listCollections({ name: 'priceSnapshots' }).toArray()).length > 0;
  if (snapExists) await db.dropCollection('priceSnapshots');
  if (keepSnaps.length > 0) {
    await PriceSnapshotModel.insertMany(keepSnaps, { ordered: false });
  }
  await PriceSnapshotModel.syncIndexes();
  console.log(`[purge] priceSnapshots restored: ${keepSnaps.length.toLocaleString()}`);
  for (const name of ['foodFacilities', 'inspections', 'violations']) {
    const exists = (await db.listCollections({ name }).toArray()).length > 0;
    if (!exists) {
      console.log(`[purge] ${name}: already absent`);
      continue;
    }
    await db.dropCollection(name);
    console.log(`[purge] dropped ${name}`);
  }

  const afterCounts = await collCounts();
  const afterGb = await dbGb();
  const [restSources, snapSources, withDd, withUe, withGh, observed, synthetic] = await Promise.all([
    RestaurantModel.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]),
    PriceSnapshotModel.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]),
    RestaurantModel.countDocuments({ 'platformIds.doordash': { $exists: true, $ne: '' } }),
    RestaurantModel.countDocuments({ 'platformIds.ubereats': { $exists: true, $ne: '' } }),
    RestaurantModel.countDocuments({ 'platformIds.grubhub': { $exists: true, $ne: '' } }),
    MenuItemModel.countDocuments({ synthetic: false }),
    MenuItemModel.countDocuments({ synthetic: true }),
  ]);

  console.log(JSON.stringify({
    phase: 'after',
    ...afterGb,
    collections: afterCounts,
    restaurantSources: Object.fromEntries(restSources.map((r) => [r._id ?? 'seed', r.n])),
    snapshotSources: Object.fromEntries(snapSources.map((r) => [r._id ?? 'null', r.n])),
    platformIds: { doordash: withDd, ubereats: withUe, grubhub: withGh },
    menus: { observed, synthetic },
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
