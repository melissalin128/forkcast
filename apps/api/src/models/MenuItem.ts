import { Schema, model, type InferSchemaType } from 'mongoose';
import { DIETARY_TAGS, PLATFORM_SLUGS } from './types';

/**
 * Menu rows. Every surviving row is observed (`synthetic: false`, written by
 * ingest/apifyPlatforms.ts with `observedPlatform`); ingest/menus.ts can still
 * generate `synthetic: true` rows, which must never be shown as observed prices.
 * Stored prices mix cents and dollars — read them through dollars() in repo/mongo.ts.
 */
const MenuItemSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    // Unindexed: only the purged synthetic rows ever carried one.
    facilityId: { type: String },
    name: { type: String, required: true },
    description: String,
    category: { type: String, index: true },
    cuisine: { type: String, index: true },
    /** Dine-in menu price before any platform markup. */
    basePrice: { type: Number, required: true },
    /** basePrice with each platform's markup applied. */
    platformPrices: Object.fromEntries(PLATFORM_SLUGS.map((p) => [p, { type: Number }])),
    dietaryTags: { type: [String], default: [], enum: DIETARY_TAGS },
    calories: Number,
    /** 0-1, drives which item is picked as a restaurant's sampleItem. */
    popularity: Number,
    available: { type: Boolean, default: true },
    // Unindexed: every surviving row is false, so an index has no selectivity.
    synthetic: { type: Boolean, default: true },
    /** Platform this observed price was listed on. Absent on synthetic rows. */
    observedPlatform: { type: String, enum: PLATFORM_SLUGS },
  },
  { collection: 'menuItems', versionKey: false, timestamps: true },
);
MenuItemSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export type MenuItemDoc = InferSchemaType<typeof MenuItemSchema>;
export const MenuItemModel = model('MenuItem', MenuItemSchema);
