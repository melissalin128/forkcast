import { Schema, model, type InferSchemaType } from 'mongoose';
import { DIETARY_TAGS, PLATFORM_SLUGS, SUBSCRIPTION_SLUGS } from './types';

const HistorySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    platformSlug: { type: String, required: true, enum: PLATFORM_SLUGS },
    total: { type: Number, required: true },
    orderedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    zip: { type: String, required: true },
    subscriptions: { type: [String], default: [], enum: SUBSCRIPTION_SLUGS },
    dietaryDefaults: { type: [String], default: [], enum: DIETARY_TAGS },
    savedRestaurantIds: { type: [Schema.Types.ObjectId], ref: 'Restaurant', default: [] },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true, collection: 'users' },
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const UserModel = model('User', UserSchema);
