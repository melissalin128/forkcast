// API shape shared with apps/api. Mirrors docs/PRODUCT_SPEC.md §5 "Data model".

export type PlatformSlug = 'doordash' | 'ubereats' | 'grubhub';

export interface Platform {
  slug: PlatformSlug;
  name: string;
  /** Used only for identity dots and chart lines, never fills. */
  brandColor: string;
  subscriptionName: string;
  subscriptionPerks: string[];
  /** Deep-link template. `{q}` is replaced with the URL-encoded restaurant name. */
  deepLink: string;
}

export type PromoRuleType = 'percent' | 'flat' | 'freeDelivery';

export interface Promo {
  platformSlug: PlatformSlug;
  code: string;
  rule: { type: PromoRuleType; value: number; minSubtotal?: number };
  startsAt: string;
  endsAt: string;
  /** Human label, e.g. "$2 off $15+". */
  label: string;
  /** Whether this user qualifies right now. */
  eligible: boolean;
  /** Reason shown when not eligible. */
  note?: string;
}

/** A restaurant *as listed on one platform at one moment*. */
export interface Offer {
  restaurantId: string;
  platformSlug: PlatformSlug;
  /** Items with the platform markup applied. */
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  smallOrderFee: number;
  tax: number;
  /** Tip included in the total (spec §7: include it, default 15%). */
  tip: number;
  /** Dollar amount taken off by the applied promo (0 if none). */
  promoDiscount: number;
  /** subtotal + fees + tax + tip − promoDiscount. Computed server-side. */
  total: number;
  etaMin: number;
  etaMax: number;
  promo?: Promo;
  /** True when the user's subscription (DashPass / Uber One / Grubhub+) shaped this total. */
  subscriptionApplied: boolean;
  fetchedAt: string;
}

/** Append-only history row. */
export interface PriceSnapshot {
  restaurantId: string;
  platformSlug: PlatformSlug;
  total: number;
  deliveryFee: number;
  etaMin: number;
  promoApplied: boolean;
  capturedAt: string;
}

export interface OrderLine {
  name: string;
  qty: number;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  dietaryTags: string[];
  rating: number;
  ratingCount: number;
  priceTier: 1 | 2 | 3;
  distanceMi: number;
  openUntil: string;
  location: { zip: string; geo?: { lat: number; lng: number } };
  platformIds: Partial<Record<PlatformSlug, string>>;
  /** Placeholder art for the card image area (CSS gradient). */
  image: string;
  /** The representative cart used to expose the fee breakdown. */
  order: OrderLine[];
  orderLabel: string;
  tipPct: number;
  /**
   * How much more the cheapest delivered total is right now than its 7-day
   * average, in dollars. Computed server-side from price snapshots; drives the
   * "Everyone is $4 pricier at dinner" sentence.
   */
  peakSurcharge?: number;
  /** One offer per platform that lists this restaurant. Missing = "not listed". */
  offers: Offer[];
}

export interface RestaurantsResponse {
  restaurants: Restaurant[];
  refreshedAt: string;
}

export interface HistoryResponse {
  restaurantId: string;
  snapshots: PriceSnapshot[];
}
