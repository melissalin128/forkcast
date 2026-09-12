import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A real Allegheny County inspection violation, 2014-2025 (WPRDC). The largest
 * real table in the ingest (~405k rows). Append-only; `_id` is `viol:<ckan row id>`.
 */
const ViolationSchema = new Schema(
  {
    _id: { type: String, required: true },
    encounter: { type: String, index: true },
    facilityId: { type: String, required: true, index: true },
    facilityName: { type: String, index: true },
    /** Facility category at the time of the inspection (e.g. "Restaurant without Liquor"). */
    categoryDesc: String,
    /** The violation text itself. */
    violation: String,
    violationNew: String,
    address: { num: String, street: String, city: String, state: String, zip: { type: String, index: true }, municipality: String },
    inspectedAt: { type: Date, index: true },
    startTime: String,
    endTime: String,
    rating: { type: String, index: true },
    low: String,
    medium: String,
    high: String,
    url: String,
    source: { type: String, default: 'wprdc' },
  },
  { collection: 'violations', versionKey: false, _id: false },
);
ViolationSchema.index({ facilityId: 1, inspectedAt: -1 });

export type ViolationDoc = InferSchemaType<typeof ViolationSchema>;
export const ViolationModel = model('Violation', ViolationSchema);
