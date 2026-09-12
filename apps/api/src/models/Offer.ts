import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS } from './types';
import { PromoRuleSchema } from './Promo';

const OfferPromoSchema = new Schema(
  {
    code: { type: String, required: true },
    description: { type: String },
    rule: { type: PromoRuleSchema, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { _id: false },
);

/** A restaurant as listed on one platform at one moment. */
const OfferSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    platformSlug: { type: String, required: true, enum: PLATFORM_SLUGS },
    platformRestaurantId: { type: String },
    subtotal: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    smallOrderFee: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    etaMin: { type: Number, required: true },
    etaMax: { type: Number, required: true },
    promo: { type: OfferPromoSchema },
    fetchedAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'offers' },
);
OfferSchema.index({ restaurantId: 1, platformSlug: 1, fetchedAt: -1 });

export type OfferDoc = InferSchemaType<typeof OfferSchema>;
export const OfferModel = model('Offer', OfferSchema);
