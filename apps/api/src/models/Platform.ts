import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS, SUBSCRIPTION_SLUGS } from './types';

const PlatformSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, enum: PLATFORM_SLUGS },
    name: { type: String, required: true },
    brandColor: { type: String, required: true },
    subscriptionName: { type: String, required: true },
    subscriptionSlug: { type: String, required: true, enum: SUBSCRIPTION_SLUGS },
    subscriptionPerks: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'platforms' },
);

export type PlatformDoc = InferSchemaType<typeof PlatformSchema>;
export const PlatformModel = model('Platform', PlatformSchema);
