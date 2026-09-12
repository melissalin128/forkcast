/** Counts by source. Does not print the URI. */
import mongoose from 'mongoose';
import { config } from '../config';
import { MenuItemModel, PriceSnapshotModel, RestaurantModel } from '../models';

async function main(): Promise<void> {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 12000 });
  const [restSources, snapSources, observedMenus, syntheticMenus, withDd, withUe] = await Promise.all([
    RestaurantModel.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]),
    PriceSnapshotModel.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]),
    MenuItemModel.countDocuments({ synthetic: false }),
    MenuItemModel.countDocuments({ synthetic: { $ne: false } }),
    RestaurantModel.countDocuments({ 'platformIds.doordash': { $exists: true, $ne: '' } }),
    RestaurantModel.countDocuments({ 'platformIds.ubereats': { $exists: true, $ne: '' } }),
  ]);
  console.log(JSON.stringify({
    restaurantSources: Object.fromEntries(restSources.map((r) => [r._id ?? 'null', r.n])),
    snapshotSources: Object.fromEntries(snapSources.map((r) => [r._id ?? 'null', r.n])),
    menus: { observed: observedMenus, synthetic: syntheticMenus },
    platformIds: { doordash: withDd, ubereats: withUe },
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
