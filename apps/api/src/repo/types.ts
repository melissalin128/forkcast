import type {
  Deal,
  DealType,
  NewDeal,
  NewScrapeRun,
  Offer,
  Platform,
  PlatformSlug,
  PriceSnapshot,
  Promo,
  Restaurant,
  ScrapeRun,
  ScrapeRunKind,
  ScrapeRunStatus,
  User,
} from '../models/types';

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

  /** Promos whose window contains `now`, optionally for one platform. */
  listActivePromos(now: Date, platformSlug?: string): Promise<Promo[]>;

  /** Latest offer per platform for a restaurant (any age; caller checks freshness). */
  getLatestOffers(restaurantId: string): Promise<Offer[]>;
  saveOffer(offer: Offer): Promise<Offer>;

  appendSnapshot(snapshot: PriceSnapshot): Promise<void>;
  listSnapshots(restaurantId: string, since: Date, until?: Date): Promise<PriceSnapshot[]>;

  createUser(user: NewUser): Promise<User>;
  getUser(id: string): Promise<User | null>;

  // --- deals layer (src/deals): Apify actor output + run ledger ---

  /** Insert or update by dealKey(). Repeat sightings bump lastSeenAt/lastRunId and re-activate. */
  upsertDeals(deals: NewDeal[], seen: DealSeen): Promise<UpsertDealsResult>;
  /** Mark deals for (platform, addressKey) last seen before a moment inactive. Returns the count. Never deletes. */
  deactivateDeals(platform: PlatformSlug, addressKey: string, opts: DeactivateDealsOptions): Promise<number>;
  /** Most recently seen first. */
  listDeals(filter?: DealFilter): Promise<Deal[]>;

  createScrapeRun(input: NewScrapeRun): Promise<ScrapeRun>;
  updateScrapeRun(id: string, patch: Partial<Omit<ScrapeRun, 'id'>>): Promise<ScrapeRun | null>;
  getScrapeRun(id: string): Promise<ScrapeRun | null>;
  getScrapeRunByApifyId(apifyRunId: string): Promise<ScrapeRun | null>;
  /** Newest first. */
  listScrapeRuns(filter?: ScrapeRunFilter): Promise<ScrapeRun[]>;
  countScrapeRuns(filter?: ScrapeRunFilter): Promise<number>;
  /** Sum of actualCost ?? estimatedCost over runs that reached Apify (status != skipped), optionally since a date. */
  sumScrapeRunCost(since?: Date): Promise<number>;
}

export interface DealFilter {
  addressKey?: string;
  platform?: PlatformSlug;
  dealType?: DealType;
  /** Default true: only active deals whose expiresAt is unset or after `now`. */
  activeOnly?: boolean;
  now?: Date;
  /** Case-insensitive substring on restaurantName or any cuisine. */
  q?: string;
  /** Deals with an unknown distance are kept (the actor gave no geo); ranking penalizes them instead. */
  maxDistanceMi?: number;
  limit?: number;
}

export interface ScrapeRunFilter {
  status?: ScrapeRunStatus | ScrapeRunStatus[];
  kind?: ScrapeRunKind;
  platform?: PlatformSlug;
  addressKey?: string;
  query?: string;
  since?: Date;
  limit?: number;
}

/** Who saw the deals being upserted: the ingest moment and the Apify run. */
export interface DealSeen {
  at: Date;
  runId?: string;
  runKind?: ScrapeRunKind;
}

export interface DeactivateDealsOptions {
  lastSeenBefore: Date;
  /** Only deals whose most recent sighting came from this kind of run (feed runs must not retire search-only deals). */
  lastRunKind?: ScrapeRunKind;
}

export interface UpsertDealsResult {
  inserted: number;
  updated: number;
}

export function matchesDealFilter(d: Deal, f: DealFilter): boolean {
  if (f.addressKey && d.addressKey !== f.addressKey) return false;
  if (f.platform && d.platform !== f.platform) return false;
  if (f.dealType && d.dealType !== f.dealType) return false;
  if (f.activeOnly !== false) {
    if (!d.isActive) return false;
    const now = f.now ?? new Date();
    if (d.expiresAt && d.expiresAt.getTime() <= now.getTime()) return false;
  }
  if (f.maxDistanceMi !== undefined && d.distanceMi !== undefined && d.distanceMi > f.maxDistanceMi) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!d.restaurantName.toLowerCase().includes(q) && !d.cuisine.some((c) => c.toLowerCase().includes(q))) return false;
  }
  return true;
}

export function matchesScrapeRunFilter(r: ScrapeRun, f: ScrapeRunFilter): boolean {
  if (f.status) {
    const allowed = Array.isArray(f.status) ? f.status : [f.status];
    if (!allowed.includes(r.status)) return false;
  }
  if (f.kind && r.kind !== f.kind) return false;
  if (f.platform && r.platform !== f.platform) return false;
  if (f.addressKey && r.addressKey !== f.addressKey) return false;
  if (f.query !== undefined && r.query !== f.query) return false;
  if (f.since && r.startedAt.getTime() < f.since.getTime()) return false;
  return true;
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
