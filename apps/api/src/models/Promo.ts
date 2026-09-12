import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS } from './types';

export const PromoRuleSchema = new Schema(
  {
    type: { type: String, required: true, enum: ['percent', 'flat', 'freeDelivery'] },
    value: { type: Number, default: 0 },
    minSubtotal: { type: Number, default: 0 },
  },
  { _id: false },
);

const PromoSchema = new Schema(
  {
    platformSlug: { type: String, required: true, enum: PLATFORM_SLUGS, index: true },
    code: { type: String, required: true },
    description: { type: String },
    rule: { type: PromoRuleSchema, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'promos' },
);
PromoSchema.index({ platformSlug: 1, code: 1 }, { unique: true });

export type PromoDoc = InferSchemaType<typeof PromoSchema>;
export const PromoModel = model('Promo', PromoSchema);
