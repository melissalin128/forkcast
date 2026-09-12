import { gunzipSync, gzipSync } from 'node:zlib';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS } from './types';

/**
 * Raw Apify actor output, one document per store per platform.
 * Observed marketplace listings — not modelled seed data.
 *
 * `payload` is a write-only provenance archive: nothing queries inside it, so
 * new rows store it gzipped (payloadEncoding: 'gzip'). Legacy rows are a plain
 * Mixed object with no payloadEncoding. Always read it via unpackPayload().
 */
const PlatformScrapeSchema = new Schema(
  {
    platformSlug: { type: String, required: true, enum: PLATFORM_SLUGS, index: true },
    storeId: { type: String, required: true, index: true },
    zip: { type: String, index: true },
    name: { type: String, required: true },
    url: String,
    actor: { type: String, required: true },
    runId: String,
    capturedAt: { type: Date, required: true, default: () => new Date(), index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    payloadEncoding: { type: String, enum: ['json', 'gzip'], default: 'json' },
  },
  { collection: 'platformScrapes', versionKey: false },
);
PlatformScrapeSchema.index({ platformSlug: 1, storeId: 1, capturedAt: -1 });

export type PlatformScrapeDoc = InferSchemaType<typeof PlatformScrapeSchema>;
export const PlatformScrapeModel = model('PlatformScrape', PlatformScrapeSchema);

/** Spread into a create/update: `{ ...packPayload(store.payload) }`. */
export function packPayload(value: unknown): { payload: Buffer; payloadEncoding: 'gzip' } {
  return { payload: gzipSync(Buffer.from(JSON.stringify(value))), payloadEncoding: 'gzip' };
}

/** Reads either encoding. Lean docs come back as Buffer or as a BSON Binary. */
export function unpackPayload(doc: { payload: unknown; payloadEncoding?: string | null }): unknown {
  if (doc.payloadEncoding !== 'gzip') return doc.payload;
  const raw = doc.payload as Buffer | { buffer: Uint8Array };
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer);
  return JSON.parse(gunzipSync(buf).toString('utf8'));
}
