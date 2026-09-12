/**
 * Plain TypeScript domain types shared by both storage backends (Mongo and the
 * in-memory fallback) and by the adapters, pricing engine and routes.
 * Mongoose schemas in this folder mirror these one-to-one.
 */

export type PlatformSlug = 'doordash' | 'ubereats' | 'grubhub';
export const PLATFORM_SLUGS: PlatformSlug[] = ['doordash', 'ubereats', 'grubhub'];

/** Subscription identifiers as stored on User.subscriptions and accepted by ?subs= */
export type SubscriptionSlug = 'dashpass' | 'uberone' | 'grubhubplus';
export const SUBSCRIPTION_SLUGS: SubscriptionSlug[] = ['dashpass', 'uberone', 'grubhubplus'];

export type DietaryTag = 'vegan' | 'vegetarian' | 'gluten-free' | 'halal' | 'kosher' | 'nut-free';
export const DIETARY_TAGS: DietaryTag[] = ['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'nut-free'];

export interface Platform {
  id?: string;
  slug: PlatformSlug;
  name: string;
  brandColor: string;
  subscriptionName: string;
  subscriptionSlug: SubscriptionSlug;
  subscriptionPerks: string[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  /** Street address ("3703 Forbes Ave") — used by the RestaurantMatcher. */
  address: string;
  cuisine: string[];
  dietaryTags: DietaryTag[];
  rating: number;
  ratingCount: number;
  /** 1 = $, 2 = $$, 3 = $$$ */
  priceTier: 1 | 2 | 3;
  location: { zip: string; geo: GeoPoint };
  /** platform slug -> platform-specific store id. Missing key = not listed there. */
  platformIds: Partial<Record<PlatformSlug, string>>;
  /** A representative order used to price the restaurant ("what the same meal costs"). */
  sampleItem: { name: string; menuPrice: number };
  imageUrl?: string;
}

export type PromoRuleType = 'percent' | 'flat' | 'freeDelivery';

export interface PromoRule {
  type: PromoRuleType;
  /** percent: 0-100; flat: dollars; freeDelivery: ignored */
  value: number;
  minSubtotal: number;
}

export interface Promo {
  id?: string;
  platformSlug: PlatformSlug;
  code: string;
  description?: string;
  rule: PromoRule;
  startsAt: Date;
  endsAt: Date;
}

/** A promo as captured on an offer (subset of Promo, embedded). */
export type OfferPromo = Pick<Promo, 'code' | 'rule' | 'startsAt' | 'endsAt' | 'description'>;

export interface Offer {
  id?: string;
  restaurantId: string;
  platformSlug: PlatformSlug;
  platformRestaurantId?: string;
  /** Menu price(s) with the platform's markup already applied. */
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  smallOrderFee: number;
  tax: number;
  /** Delivered total before any subscription/promo, with default tip. */
  total: number;
  etaMin: number;
  etaMax: number;
  promo?: OfferPromo;
  fetchedAt: Date;
  /**
   * Live scrapers set this when the platform's delivery-address flow could not
   * be completed, so the fees may be for the platform's default location.
   */
  locationUnverified?: boolean;
  /** Store page URL as the platform canonicalised it (falls back to adapter.storeUrl). */
  deepLink?: string;
  /** The menu item the subtotal was priced on (when the cart could not be matched by name). */
  representativeItem?: { name: string; price: number };
}

export interface PriceSnapshot {
  id?: string;
  restaurantId: string;
  platformSlug: PlatformSlug;
  total: number;
  deliveryFee: number;
  etaMin: number;
  promoApplied: boolean;
  capturedAt: Date;
}

export interface UserHistoryEntry {
  restaurantId: string;
  platformSlug: PlatformSlug;
  total: number;
  orderedAt: Date;
}

export interface User {
  id: string;
  zip: string;
  subscriptions: SubscriptionSlug[];
  dietaryDefaults: DietaryTag[];
  savedRestaurantIds: string[];
  history: UserHistoryEntry[];
  createdAt?: Date;
}
