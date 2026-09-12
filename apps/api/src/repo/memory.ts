/**
 * Map-backed repository used when MONGODB_URI is unset or Mongo is unreachable.
 * Seeded from src/seed/data.ts plus 7 days of hourly snapshots generated with
 * the mock adapter curves, so every endpoint has data.
 */
import { randomUUID } from 'node:crypto';
import {
  dealKey,
  type Deal,
  type NewDeal,
  type NewScrapeRun,
  type Offer,
  type Platform,
  type PlatformSlug,
  type PriceSnapshot,
  type Promo,
  type Restaurant,
  type ScrapeRun,
  type User,
} from '../models/types';
import { platforms as seedPlatforms, promos as seedPromos, restaurants as seedRestaurants } from '../seed/data';
import { generateSnapshots } from '../seed/snapshots';
import {
  matchesDealFilter,
  matchesFilter,
  matchesScrapeRunFilter,
  type DealFilter,
  type DealSeen,
  type DeactivateDealsOptions,
  type NewRestaurant,
  type NewUser,
  type Repository,
  type RestaurantFilter,
  type ScrapeRunFilter,
  type UpsertDealsResult,
} from './types';

export class MemoryRepository implements Repository {
  readonly kind = 'memory' as const;

  private platforms: Platform[] = [];
  private restaurants = new Map<string, Restaurant>();
  private promos: Promo[] = [];
  /** `${restaurantId}:${platformSlug}` -> latest offer */
  private offers = new Map<string, Offer>();
  /** restaurantId -> snapshots (append-only) */
  private snapshots = new Map<string, PriceSnapshot[]>();
  private users = new Map<string, User>();
  /** dealKey() -> deal */
  private deals = new Map<string, Deal>();
  private scrapeRuns = new Map<string, ScrapeRun>();

  /** Platforms + promos only: the live scrapers fill in restaurants, offers and history. */
  static empty(): MemoryRepository {
    const repo = new MemoryRepository();
    repo.platforms = seedPlatforms.map((p) => ({ ...p, id: p.slug }));
    repo.promos = seedPromos.map((p, i) => ({ ...p, id: `promo_${i + 1}` }));
    return repo;
  }

  static seeded(options: { historyDays?: number; now?: Date } = {}): MemoryRepository {
    const repo = new MemoryRepository();
    repo.platforms = seedPlatforms.map((p) => ({ ...p, id: p.slug }));
    for (const r of seedRestaurants) repo.restaurants.set(r.slug, { ...r, id: r.slug });
    repo.promos = seedPromos.map((p, i) => ({ ...p, id: `promo_${i + 1}` }));
    const snaps = generateSnapshots(seedRestaurants, { days: options.historyDays ?? 7, now: options.now });
    for (const s of snaps) {
      const list = repo.snapshots.get(s.restaurantId) ?? [];
      list.push(s);
      repo.snapshots.set(s.restaurantId, list);
    }
    return repo;
  }

  async listPlatforms(): Promise<Platform[]> {
    return this.platforms;
  }

  async listRestaurants(filter: RestaurantFilter = {}): Promise<Restaurant[]> {
    return [...this.restaurants.values()].filter((r) => matchesFilter(r, filter));
  }

  async getRestaurant(idOrSlug: string): Promise<Restaurant | null> {
    return this.restaurants.get(idOrSlug) ?? [...this.restaurants.values()].find((r) => r.id === idOrSlug) ?? null;
  }

  async upsertRestaurant(input: NewRestaurant): Promise<Restaurant> {
    const existing = this.restaurants.get(input.slug);
    const merged: Restaurant = {
      ...(existing ?? {}),
      ...input,
      id: existing?.id ?? input.slug,
      platformIds: { ...(existing?.platformIds ?? {}), ...input.platformIds },
      imageUrl: input.imageUrl ?? existing?.imageUrl,
    };
    this.restaurants.set(input.slug, merged);
    return merged;
  }

  async listActivePromos(now: Date, platformSlug?: string): Promise<Promo[]> {
    const t = now.getTime();
    return this.promos.filter(
      (p) => (!platformSlug || p.platformSlug === platformSlug) && p.startsAt.getTime() <= t && p.endsAt.getTime() >= t,
    );
  }

  async getLatestOffers(restaurantId: string): Promise<Offer[]> {
    const out: Offer[] = [];
    for (const [key, o] of this.offers) if (key.startsWith(`${restaurantId}:`)) out.push(o);
    return out;
  }

  async saveOffer(offer: Offer): Promise<Offer> {
    const saved = { ...offer, id: offer.id ?? randomUUID() };
    this.offers.set(`${offer.restaurantId}:${offer.platformSlug}`, saved);
    return saved;
  }

  async appendSnapshot(snapshot: PriceSnapshot): Promise<void> {
    const list = this.snapshots.get(snapshot.restaurantId) ?? [];
    // append-only, but idempotent on the (platform, capturedAt) key like the Mongo unique index
    const t = snapshot.capturedAt.getTime();
    if (!list.some((s) => s.platformSlug === snapshot.platformSlug && s.capturedAt.getTime() === t)) {
      list.push({ ...snapshot, id: randomUUID() });
      this.snapshots.set(snapshot.restaurantId, list);
    }
  }

  async listSnapshots(restaurantId: string, since: Date, until: Date = new Date(8.64e15)): Promise<PriceSnapshot[]> {
    const s = since.getTime();
    const u = until.getTime();
    return (this.snapshots.get(restaurantId) ?? [])
      .filter((x) => x.capturedAt.getTime() >= s && x.capturedAt.getTime() <= u)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }

  async createUser(input: NewUser): Promise<User> {
    const user: User = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      zip: input.zip,
      subscriptions: input.subscriptions ?? [],
      dietaryDefaults: input.dietaryDefaults ?? [],
      savedRestaurantIds: input.savedRestaurantIds ?? [],
      history: input.history ?? [],
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  // --- deals layer ---

  async upsertDeals(deals: NewDeal[], seen: DealSeen): Promise<UpsertDealsResult> {
    let inserted = 0;
    let updated = 0;
    for (const d of deals) {
      const key = dealKey(d);
      const existing = this.deals.get(key);
      if (existing) {
        this.deals.set(key, {
          ...d,
          id: existing.id,
          firstSeenAt: existing.firstSeenAt,
          firstRunId: existing.firstRunId,
          lastSeenAt: seen.at,
          lastRunId: seen.runId ?? existing.lastRunId,
          lastRunKind: seen.runKind ?? existing.lastRunKind,
          isActive: true,
        });
        updated += 1;
      } else {
        this.deals.set(key, {
          ...d,
          id: randomUUID(),
          firstSeenAt: seen.at,
          lastSeenAt: seen.at,
          firstRunId: seen.runId,
          lastRunId: seen.runId,
          lastRunKind: seen.runKind,
          isActive: true,
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  }

  async deactivateDeals(platform: PlatformSlug, addressKey: string, opts: DeactivateDealsOptions): Promise<number> {
    const before = opts.lastSeenBefore.getTime();
    let n = 0;
    for (const [key, d] of this.deals) {
      if (!d.isActive || d.platform !== platform || d.addressKey !== addressKey) continue;
      if (opts.lastRunKind && d.lastRunKind !== opts.lastRunKind) continue;
      if (d.lastSeenAt.getTime() >= before) continue;
      this.deals.set(key, { ...d, isActive: false });
      n += 1;
    }
    return n;
  }

  async listDeals(filter: DealFilter = {}): Promise<Deal[]> {
    const out = [...this.deals.values()]
      .filter((d) => matchesDealFilter(d, filter))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async createScrapeRun(input: NewScrapeRun): Promise<ScrapeRun> {
    const run: ScrapeRun = {
      resultsReturned: 0,
      dealsExtracted: 0,
      parseFailures: 0,
      ...input,
      id: `run_${randomUUID().slice(0, 8)}`,
    };
    this.scrapeRuns.set(run.id, run);
    return run;
  }

  async updateScrapeRun(id: string, patch: Partial<Omit<ScrapeRun, 'id'>>): Promise<ScrapeRun | null> {
    const existing = this.scrapeRuns.get(id);
    if (!existing) return null;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const next: ScrapeRun = { ...existing, ...defined, id };
    this.scrapeRuns.set(id, next);
    return next;
  }

  async getScrapeRun(id: string): Promise<ScrapeRun | null> {
    return this.scrapeRuns.get(id) ?? null;
  }

  async getScrapeRunByApifyId(apifyRunId: string): Promise<ScrapeRun | null> {
    return [...this.scrapeRuns.values()].find((r) => r.apifyRunId === apifyRunId) ?? null;
  }

  async listScrapeRuns(filter: ScrapeRunFilter = {}): Promise<ScrapeRun[]> {
    const out = [...this.scrapeRuns.values()]
      .filter((r) => matchesScrapeRunFilter(r, filter))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async countScrapeRuns(filter: ScrapeRunFilter = {}): Promise<number> {
    return [...this.scrapeRuns.values()].filter((r) => matchesScrapeRunFilter(r, filter)).length;
  }

  async sumScrapeRunCost(since?: Date): Promise<number> {
    let total = 0;
    for (const r of this.scrapeRuns.values()) {
      if (r.status === 'skipped') continue;
      if (since && r.startedAt.getTime() < since.getTime()) continue;
      total += r.actualCost ?? r.estimatedCost;
    }
    return total;
  }
}
