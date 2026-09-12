/** One-shot: print dataSize / collection counts. Does not print the URI. */
import mongoose from 'mongoose';
import { config } from '../config';

async function main(): Promise<void> {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 12000 });
  const db = mongoose.connection.db!;
  const st = await db.stats();
  const cols = await db.listCollections().toArray();
  const collections: Record<string, { n: number; sizeMB: number }> = {};
  for (const c of cols) {
    const s = (await db.command({ collStats: c.name })) as { count?: number; size?: number };
    collections[c.name] = {
      n: s.count ?? 0,
      sizeMB: Number(((s.size ?? 0) / 1024 / 1024).toFixed(2)),
    };
  }
  console.log(JSON.stringify({
    db: mongoose.connection.name,
    dataGB: Number((st.dataSize / 1024 ** 3).toFixed(3)),
    storageGB: Number((st.storageSize / 1024 ** 3).toFixed(3)),
    indexGB: Number((st.indexSize / 1024 ** 3).toFixed(3)),
    objects: st.objects,
    collections,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
