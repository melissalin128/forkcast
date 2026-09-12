import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS } from './types';

/** Append-only price history. Never updated, never deleted by the app. */
const PriceSnapshotSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    platformSlug: { type: String, required: true, enum: PLATFORM_SLUGS },
    total: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    etaMin: { type: Number, required: true },
    promoApplied: { type: Boolean, default: false },
    capturedAt: { type: Date, required: true },
    /**
     * Where this row came from. 'modelled' is NOT an observed price: it is the
     * default, so both src/ingest/snapshots.ts and the mock-adapter pricing path
     * (services/offers.ts -> repo.appendSnapshot) write it. apify-* rows come
     * from src/ingest/apifyPlatforms.ts; the partner-API values from
     * src/ingest/liveQuotes.ts carry a logistics fee, not a checkout total.
     * Never mix these in the UI without saying which is which.
     */
    source: {
      type: String,
      enum: ['modelled', 'doordash-drive', 'uber-direct', 'apify-doordash', 'apify-ubereats'],
      default: 'modelled',
      index: true,
    },
  },
  { collection: 'priceSnapshots', versionKey: false },
);
PriceSnapshotSchema.index({ restaurantId: 1, platformSlug: 1, capturedAt: 1 }, { unique: true });

export type PriceSnapshotDoc = InferSchemaType<typeof PriceSnapshotSchema>;
export const PriceSnapshotModel = model('PriceSnapshot', PriceSnapshotSchema);
