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

// ---------------------------------------------------------------------------
// Deals layer: Apify actor output normalized into deals (src/deals/).
// ---------------------------------------------------------------------------

export type DealType =
  | 'free_delivery'
  | 'reduced_delivery_fee'
  | 'percent_off'
  | 'dollar_off'
  | 'bogo'
  | 'item_discount'
  | 'promo_code'
  | 'other';
export const DEAL_TYPES: DealType[] = [
  'free_delivery',
  'reduced_delivery_fee',
  'percent_off',
  'dollar_off',
  'bogo',
  'item_discount',
  'promo_code',
  'other',
];

/** Numeric parts of a deal where the headline could be parsed. All optional; missing = unknown, never 0. */
export interface DealValue {
  percent?: number;
  dollars?: number;
  deliveryFee?: number;
  originalPrice?: number;
  salePrice?: number;
}

export type ScrapeRunKind = 'feed' | 'search';
export const SCRAPE_RUN_KINDS: ScrapeRunKind[] = ['feed', 'search'];

/** A promo for one restaurant on one platform, scraped for one configured address. Upserted, never deleted. */
export interface Deal {
  id?: string;
  platform: PlatformSlug;
  restaurantName: string;
  platformRestaurantId: string;
  cuisine: string[];
  geo?: GeoPoint;
  /** Miles from the configured address (computed by us, not by the actor). */
  distanceMi?: number;
  dealType: DealType;
  /** Deal text as shown on the platform. Part of the upsert identity. */
  headline: string;
  value?: DealValue;
  minOrder?: number;
  promoCode?: string;
  /** deals.config.json addresses[].key this deal was scraped for (e.g. "15232"). */
  addressKey: string;
  deepLink?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  /** Apify run ids that first / most recently returned this deal. */
  firstRunId?: string;
  lastRunId?: string;
  lastRunKind?: ScrapeRunKind;
  /** Source item exactly as the actor returned it, so deals can be re-normalized without re-running. */
  raw?: unknown;
}

/** Parser output: a deal before the repository assigns its lifecycle fields. */
export type NewDeal = Omit<
  Deal,
  'id' | 'firstSeenAt' | 'lastSeenAt' | 'isActive' | 'firstRunId' | 'lastRunId' | 'lastRunKind'
>;

/** Upsert identity: (platform, platformRestaurantId, headline, addressKey). */
export function dealKey(d: Pick<Deal, 'platform' | 'platformRestaurantId' | 'headline' | 'addressKey'>): string {
  return JSON.stringify([d.platform, d.platformRestaurantId, d.headline, d.addressKey]);
}

export type ScrapeRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted' | 'skipped';
export const SCRAPE_RUN_STATUSES: ScrapeRunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'aborted', 'skipped'];

/**
 * One attempt to run an actor, including attempts the cost guard refused
 * (`status: 'skipped'`). This is the scraper-health and credit-burn ledger.
 */
export interface ScrapeRun {
  id: string;
  platform: PlatformSlug;
  addressKey: string;
  kind: ScrapeRunKind;
  /** Search term for `kind: 'search'`; the feed query list joined for `kind: 'feed'`. */
  query?: string;
  actorId: string;
  apifyRunId?: string;
  datasetId?: string;
  startedAt: Date;
  finishedAt?: Date;
  status: ScrapeRunStatus;
  resultsReturned: number;
  dealsExtracted: number;
  parseFailures: number;
  /** Pre-run estimate in USD from the actor pricing in deals.config.json. */
  estimatedCost: number;
  /** Apify's reported usageTotalUsd once the run finished. */
  actualCost?: number;
  error?: string;
}

export type NewScrapeRun = Omit<ScrapeRun, 'id' | 'resultsReturned' | 'dealsExtracted' | 'parseFailures'> &
  Partial<Pick<ScrapeRun, 'resultsReturned' | 'dealsExtracted' | 'parseFailures'>>;
