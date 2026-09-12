import { Schema, model, type InferSchemaType } from 'mongoose';
import { DIETARY_TAGS } from './types';

const RestaurantSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, index: true },
    address: { type: String, required: true },
    cuisine: { type: [String], default: [], index: true },
    dietaryTags: { type: [String], default: [], enum: DIETARY_TAGS },
    rating: { type: Number, required: true, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    priceTier: { type: Number, required: true, enum: [1, 2, 3] },
    location: {
      zip: { type: String, required: true, index: true },
      geo: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },
    // platform slug -> platform-specific store id
    platformIds: {
      doordash: { type: String },
      ubereats: { type: String },
      grubhub: { type: String },
    },
    sampleItem: {
      name: { type: String, required: true },
      menuPrice: { type: Number, required: true },
    },
    imageUrl: { type: String },

    // ---- open-data provenance (src/ingest). Absent on the curated demo rows. ----
    /** WPRDC facility id when this row was promoted from Allegheny County open data. */
    facilityId: { type: String, unique: true, sparse: true },
    /** 'seed' (curated demo) | 'wprdc' (Allegheny County open data). */
    source: { type: String, default: 'seed', index: true },
    neighborhood: { type: String, index: true },
    seatCount: { type: Number },
    sqFeet: { type: Number },
    /** Most recent real inspection placard, e.g. "Inspected & Permitted". */
    lastInspection: {
      placardDesc: { type: String },
      inspectedAt: { type: Date },
      violationCount: { type: Number },
    },
    // ---- OpenStreetMap enrichment (ODbL), when a POI matched ----
    // Unindexed: no query filters on osmId, and the purge left zero rows carrying one.
    osmId: { type: String },
    phone: { type: String },
    website: { type: String },
    openingHours: { type: String },
    /** True when rating/priceTier/sampleItem were derived rather than observed. */
    derivedFields: { type: [String], default: [] },
    /**
     * Platforms this listing was actually observed on, by src/ingest/reconcileProvenance.ts.
     * Not the same as platformIds: that is an id we hold, this is evidence we
     * used it (a platformScrapes row, or menuItems with that observedPlatform).
     */
    observedOn: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'restaurants' },
);
RestaurantSchema.index({ 'location.geo.lat': 1, 'location.geo.lng': 1 });

export type RestaurantDoc = InferSchemaType<typeof RestaurantSchema>;
export const RestaurantModel = model('Restaurant', RestaurantSchema);
