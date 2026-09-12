/**
 * Map-backed repository used when MONGODB_URI is unset or Mongo is unreachable.
 * Seeded from src/seed/data.ts plus 7 days of hourly snapshots generated with
 * the mock adapter curves, so every endpoint has data.
 */
import { randomUUID } from 'node:crypto';
import type { Offer, Platform, PriceSnapshot, Promo, Restaurant, User } from '../models/types';
import { platforms as seedPlatforms, promos as seedPromos, restaurants as seedRestaurants } from '../seed/data';
import { generateSnapshots } from '../seed/snapshots';
import { matchesFilter, type NewUser, type Repository, type RestaurantFilter } from './types';

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
}
