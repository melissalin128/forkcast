import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Allegheny County food facility, as published by WPRDC ("Geocoded Food
 * Facilities"). The full master list — restaurants, but also school cafeterias,
 * nursing homes, commissaries and retail. Real data, open licence.
 *
 * `_id` is `fac:<ckan row id>` so re-running the ingest is idempotent without
 * paying for an extra unique index.
 */
const FoodFacilitySchema = new Schema(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    address: {
      num: String,
      street: String,
      full: String,
      city: { type: String, index: true },
      state: String,
      zip: { type: String, index: true },
      municipality: String,
    },
    categoryCode: { type: String, index: true },
    categoryDesc: { type: String, index: true },
    permitCode: String,
    seatCount: Number,
    sqFeet: Number,
    noRoom: String,
    status: { type: String, index: true },
    placardStatus: String,
    businessStartDate: Date,
    businessCloseDate: Date,
    /** GeoJSON Point [lng, lat]; absent when the county could not geocode it. */
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    source: { type: String, default: 'wprdc' },
  },
  { collection: 'foodFacilities', versionKey: false, timestamps: true, _id: false },
);
FoodFacilitySchema.index({ geo: '2dsphere' });

export type FoodFacilityDoc = InferSchemaType<typeof FoodFacilitySchema>;
export const FoodFacilityModel = model('FoodFacility', FoodFacilitySchema);
