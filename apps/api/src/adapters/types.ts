import type { Offer, PlatformSlug, Restaurant } from '../models/types';

/** One line of the cart used to price a restaurant. */
export interface CartItem {
  name: string;
  quantity: number;
  /** Menu price on the platform, if known. Mock adapter uses it as the base price. */
  unitPrice?: number;
}

export type Cart = CartItem[];

/** What a platform search returns before it is matched across platforms. */
export interface PlatformListing {
  platformSlug: PlatformSlug;
  platformRestaurantId: string;
  name: string;
  address: string;
  zip?: string;
  cuisine: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  /** Deep link to the store page on the platform. */
  url?: string;
}

export interface FetchOfferOptions {
  /** Price "as of" this moment. Live adapters ignore it; the mock uses it to replay curves. */
  at?: Date;
}

/**
 * One interface, three scrapers (spec section 6).
 *
 *   searchRestaurants(zip, query) -> listings (name, cuisine, rating, image, platform-specific id)
 *   fetchOffer(platformRestaurantId, zip, cart) -> Offer (subtotal, fees, promo, total, ETA)
 *
 * Every fetchOffer result is also appended as a PriceSnapshot by the caller
 * (services/offers.ts), which is what powers price history.
 */
export interface PlatformAdapter {
  readonly platformSlug: PlatformSlug;
  searchRestaurants(zip: string, query?: string): Promise<PlatformListing[]>;
  fetchOffer(
    platformRestaurantId: string,
    zip: string,
    cart: Cart,
    options?: FetchOfferOptions,
  ): Promise<Offer>;
  /** Deep link for "Order on [platform]". */
  storeUrl(platformRestaurantId: string): string;
  /** Release browser contexts etc. No-op for the mock. */
  close?(): Promise<void>;
}

export class NotImplementedError extends Error {
  readonly status = 501;
  constructor(message = 'not implemented') {
    super(message);
    this.name = 'NotImplementedError';
  }
}

/** Convenience for adapters that only know the store id: derive a cart from the catalog. */
export function cartForRestaurant(r: Pick<Restaurant, 'sampleItem'>): Cart {
  return [{ name: r.sampleItem.name, quantity: 1, unitPrice: r.sampleItem.menuPrice }];
}
