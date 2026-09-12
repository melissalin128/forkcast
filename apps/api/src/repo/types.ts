import type { MenuItem, Offer, Platform, PriceSnapshot, Promo, Restaurant, User } from '../models/types';

export interface RestaurantFilter {
  zip?: string;
  q?: string;
  cuisine?: string;
  dietary?: string[];
  minRating?: number;
}

export type NewUser = Pick<User, 'zip' | 'subscriptions' | 'dietaryDefaults'> &
  Partial<Pick<User, 'savedRestaurantIds' | 'history'>>;

/** A restaurant discovered by the live scrapers; keyed by `slug`. */
export type NewRestaurant = Omit<Restaurant, 'id'>;

/**
 * The small storage contract the routes are written against. `MongoRepository`
 * and `MemoryRepository` both implement it, so the API runs with or without a
 * MONGODB_URI.
 */
export interface Repository {
  readonly kind: 'mongo' | 'memory';

  listPlatforms(): Promise<Platform[]>;

  listRestaurants(filter?: RestaurantFilter): Promise<Restaurant[]>;
  /** Accepts a Mongo ObjectId string or a slug. */
  getRestaurant(idOrSlug: string): Promise<Restaurant | null>;
  /**
   * Insert or update by slug. Existing `platformIds` are merged (a scrape of one
   * platform never drops the ids found on another); other fields are replaced.
   */
  upsertRestaurant(input: NewRestaurant): Promise<Restaurant>;

  /** Observed menu rows for a restaurant, sorted by category then name. */
  listMenuItems(restaurantId: string, opts?: { limit?: number; category?: string }): Promise<MenuItem[]>;

  /** Promos whose window contains `now`, optionally for one platform. */
  listActivePromos(now: Date, platformSlug?: string): Promise<Promo[]>;

  /** Latest offer per platform for a restaurant (any age; caller checks freshness). */
  getLatestOffers(restaurantId: string): Promise<Offer[]>;
  saveOffer(offer: Offer): Promise<Offer>;

  appendSnapshot(snapshot: PriceSnapshot): Promise<void>;
  listSnapshots(restaurantId: string, since: Date, until?: Date): Promise<PriceSnapshot[]>;

  createUser(user: NewUser): Promise<User>;
  getUser(id: string): Promise<User | null>;
}

/** Pittsburgh demo service area: every seeded zip delivers to every other 152xx zip. */
export function servesZip(restaurantZip: string, requestedZip?: string): boolean {
  if (!requestedZip) return true;
  if (restaurantZip === requestedZip) return true;
  return restaurantZip.startsWith('152') && requestedZip.startsWith('152');
}

export function matchesFilter(r: Restaurant, f: RestaurantFilter): boolean {
  if (!servesZip(r.location.zip, f.zip)) return false;
  if (f.minRating !== undefined && r.rating < f.minRating) return false;
  if (f.cuisine) {
    const c = f.cuisine.toLowerCase();
    if (!r.cuisine.some((x) => x.toLowerCase().includes(c))) return false;
  }
  if (f.dietary && f.dietary.length > 0) {
    const tags = new Set(r.dietaryTags.map((t) => t.toLowerCase()));
    if (!f.dietary.every((d) => tags.has(d.toLowerCase()))) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [r.name, ...r.cuisine, r.sampleItem.name].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
