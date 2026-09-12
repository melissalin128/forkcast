/**
 * Gzip the platformScrapes.payload archive in place. Nothing reads inside
 * payload, so it is stored as compressed JSON (see models/PlatformScrape.ts).
 *
 *   npx tsx src/ingest/compressScrapes.ts            # dry run, measures a sample
 *   npx tsx src/ingest/compressScrapes.ts --apply    # converts, batched cursor
 *
 * Idempotent: only touches docs whose payloadEncoding is not 'gzip'.
 * Does not print MONGODB_URI.
 */
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import { config } from '../config';
import { PlatformScrapeModel, packPayload, unpackPayload } from '../models';

const COLL = 'platformScrapes';
const BATCH = 25;
const UNCOMPRESSED = { payloadEncoding: { $ne: 'gzip' } };

const mb = (bytes: number): number => Number((bytes / 1024 / 1024).toFixed(2));

async function collSize(): Promise<{ docs: number; dataBytes: number; dataMB: number; storageMB: number }> {
  const s = (await mongoose.connection.db!.command({ collStats: COLL })) as {
    count?: number;
    size?: number;
    storageSize?: number;
  };
  return {
    docs: s.count ?? 0,
    dataBytes: s.size ?? 0,
    dataMB: mb(s.size ?? 0),
    storageMB: mb(s.storageSize ?? 0),
  };
}

/** Gzip ~25 real payloads and report the measured ratio (no guessing). */
async function sampleRatio(): Promise<{
  sampled: number;
  payloadBytes: number;
  gzipBytes: number;
  payloadMB: number;
  gzipMB: number;
  ratio: number;
}> {
  const rows = await PlatformScrapeModel.aggregate<{ payload: unknown; payloadSize: number }>([
    { $match: UNCOMPRESSED },
    { $sample: { size: BATCH } },
    // wrapper doc so $bsonSize works whatever shape payload has
    { $project: { _id: 0, payload: 1, payloadSize: { $bsonSize: { p: '$payload' } } } },
  ]);
  let payloadBytes = 0;
  let gzipBytes = 0;
  for (const r of rows) {
    payloadBytes += r.payloadSize;
    gzipBytes += packPayload(r.payload).payload.byteLength;
  }
  return {
    sampled: rows.length,
    payloadBytes,
    gzipBytes,
    payloadMB: mb(payloadBytes),
    gzipMB: mb(gzipBytes),
    ratio: gzipBytes > 0 ? Number((payloadBytes / gzipBytes).toFixed(1)) : 0,
  };
}

/**
 * Walks every uncompressed doc and proves its gzip decodes back to the exact
 * original before it may be written. The $set overwrites the only copy, and
 * JSON silently turns a Date into a string and drops undefined/NaN, so a doc
 * that fails is refused (left untouched) and listed. apply=false writes nothing.
 */
async function convert(apply: boolean): Promise<{ ok: number; written: number; refused: string[] }> {
  const cursor = PlatformScrapeModel.find(UNCOMPRESSED, { payload: 1 })
    .lean()
    .cursor({ batchSize: BATCH });
  let ops: Parameters<typeof PlatformScrapeModel.bulkWrite>[0] = [];
  let ok = 0;
  let written = 0;
  const refused: string[] = [];
  const flush = async (): Promise<void> => {
    if (ops.length === 0) return;
    written += (await PlatformScrapeModel.bulkWrite(ops)).modifiedCount;
    process.stdout.write(`[compress] converted ${written}\r`);
    ops = [];
  };
  for await (const doc of cursor) {
    const packed = packPayload(doc.payload);
    if (!isDeepStrictEqual(unpackPayload(packed), doc.payload)) {
      refused.push(String(doc._id));
      continue;
    }
    ok += 1;
    if (!apply) continue;
    // re-check the precondition in the filter so a concurrent run can't double-write
    ops.push({ updateOne: { filter: { _id: doc._id, ...UNCOMPRESSED }, update: { $set: packed } } });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  if (apply) process.stdout.write('\n');
  return { ok, written, refused };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[compress] connected to ${mongoose.connection.name}`);

  const before = await collSize();
  const todo = await PlatformScrapeModel.countDocuments(UNCOMPRESSED);
  console.log(
    JSON.stringify({ phase: 'before', collection: COLL, ...before, uncompressed: todo }, null, 2),
  );

  if (todo === 0) {
    console.log('[compress] nothing to do — every payload is already gzip');
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    const s = await sampleRatio();
    const check = await convert(false);
    // scale the measured per-doc saving over every doc still uncompressed
    const savedPerDoc = (s.payloadBytes - s.gzipBytes) / Math.max(s.sampled, 1);
    const projectedMB = mb(Math.max(before.dataBytes - savedPerDoc * todo, 0));
    console.log(
      JSON.stringify(
        {
          phase: 'dry-run',
          wouldUpdate: `${check.ok} docs in ${COLL} ($set payload -> gzip Buffer, payloadEncoding -> 'gzip')`,
          roundTripVerified: check.ok,
          refusedLossy: check.refused,
          sample: { sampled: s.sampled, payloadMB: s.payloadMB, gzipMB: s.gzipMB, ratio: s.ratio },
          projectedDataMB: projectedMB,
          projectedSavingMB: Number((before.dataMB - projectedMB).toFixed(2)),
        },
        null,
        2,
      ),
    );
    console.log('[compress] dry run only — re-run with --apply to write');
    await mongoose.disconnect();
    return;
  }

  const { written, refused } = await convert(true);
  const after = await collSize();
  console.log(
    JSON.stringify(
      {
        phase: 'after',
        converted: written,
        refusedLossy: refused,
        stillUncompressed: await PlatformScrapeModel.countDocuments(UNCOMPRESSED),
        ...after,
        dataSavedMB: Number((before.dataMB - after.dataMB).toFixed(2)),
      },
      null,
      2,
    ),
  );
  // storageSize only shrinks after a compact; dataSize is the real win.
  console.log('[compress] done');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
