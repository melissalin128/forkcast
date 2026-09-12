import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A real Allegheny County health inspection, 2014-2025 (WPRDC). Append-only.
 * `_id` is `insp:<ckan row id>`.
 */
const InspectionSchema = new Schema(
  {
    _id: { type: String, required: true },
    encounter: { type: String, index: true },
    facilityId: { type: String, required: true, index: true },
    facilityName: { type: String, index: true },
    placardStatus: String,
    placardDesc: { type: String, index: true },
    categoryCode: String,
    categoryDesc: String,
    address: { num: String, street: String, city: String, state: String, zip: { type: String, index: true }, municipality: String },
    inspectedAt: { type: Date, index: true },
    startTime: String,
    endTime: String,
    purpose: String,
    purposeAbbr: String,
    reinspectCode: String,
    reinspectDate: Date,
    source: { type: String, default: 'wprdc' },
  },
  { collection: 'inspections', versionKey: false, _id: false },
);
InspectionSchema.index({ facilityId: 1, inspectedAt: -1 });

export type InspectionDoc = InferSchemaType<typeof InspectionSchema>;
export const InspectionModel = model('Inspection', InspectionSchema);
