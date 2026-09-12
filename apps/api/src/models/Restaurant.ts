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
  },
  { timestamps: true, collection: 'restaurants' },
);

export type RestaurantDoc = InferSchemaType<typeof RestaurantSchema>;
export const RestaurantModel = model('Restaurant', RestaurantSchema);
