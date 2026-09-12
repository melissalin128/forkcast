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
  },
  { collection: 'priceSnapshots', versionKey: false },
);
PriceSnapshotSchema.index({ restaurantId: 1, platformSlug: 1, capturedAt: 1 }, { unique: true });

export type PriceSnapshotDoc = InferSchemaType<typeof PriceSnapshotSchema>;
export const PriceSnapshotModel = model('PriceSnapshot', PriceSnapshotSchema);
