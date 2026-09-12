import { Schema, model, type InferSchemaType } from 'mongoose';
import { DEAL_TYPES, PLATFORM_SLUGS, SCRAPE_RUN_KINDS } from './types';

const DealValueSchema = new Schema(
  {
    percent: { type: Number },
    dollars: { type: Number },
    deliveryFee: { type: Number },
    originalPrice: { type: Number },
    salePrice: { type: Number },
  },
  { _id: false },
);

/**
 * A promo for one restaurant on one platform, scraped for one configured
 * address. Upserted on (platform, platformRestaurantId, headline, addressKey);
 * deals that stop appearing are marked inactive, never deleted.
 */
const DealSchema = new Schema(
  {
    platform: { type: String, required: true, enum: PLATFORM_SLUGS },
    restaurantName: { type: String, required: true },
    platformRestaurantId: { type: String, required: true },
    cuisine: { type: [String], default: [] },
    geo: { type: new Schema({ lat: { type: Number }, lng: { type: Number } }, { _id: false }) },
    distanceMi: { type: Number },
    dealType: { type: String, required: true, enum: DEAL_TYPES, index: true },
    headline: { type: String, required: true },
    value: { type: DealValueSchema },
    minOrder: { type: Number },
    promoCode: { type: String },
    addressKey: { type: String, required: true },
    deepLink: { type: String },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
    firstRunId: { type: String },
    lastRunId: { type: String },
    lastRunKind: { type: String, enum: SCRAPE_RUN_KINDS },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'deals' },
);
DealSchema.index({ platform: 1, platformRestaurantId: 1, headline: 1, addressKey: 1 }, { unique: true });
DealSchema.index({ addressKey: 1, isActive: 1, platform: 1 });

export type DealDoc = InferSchemaType<typeof DealSchema>;
export const DealModel = model('Deal', DealSchema);
