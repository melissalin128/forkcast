/**
 * Generates `days` x 24 hourly PriceSnapshots per restaurant per listed
 * platform using the mock adapter curves. Used by both `npm run seed` (Mongo)
 * and the in-memory fallback so the history looks identical either way.
 */
import { MockAdapter, hourBucket } from '../adapters/mock';
import { cartForRestaurant } from '../adapters/types';
import { PLATFORM_SLUGS, type PriceSnapshot, type Restaurant } from '../models/types';

export interface SnapshotGenOptions {
  days?: number;
  now?: Date;
  /** Map a seed restaurant to the id the snapshot should carry (Mongo ObjectId vs slug). */
  idFor?: (r: Restaurant) => string;
}

const adapters = Object.fromEntries(PLATFORM_SLUGS.map((p) => [p, new MockAdapter(p)])) as Record<
  (typeof PLATFORM_SLUGS)[number],
  MockAdapter
>;

export function generateSnapshots(restaurants: Restaurant[], options: SnapshotGenOptions = {}): PriceSnapshot[] {
  const days = options.days ?? 7;
  const end = hourBucket(options.now ?? new Date());
  const idFor = options.idFor ?? ((r: Restaurant) => r.id);
  const hours = days * 24;
  const out: PriceSnapshot[] = [];

  for (const r of restaurants) {
    const cart = cartForRestaurant(r);
    const id = idFor(r);
    for (const platform of PLATFORM_SLUGS) {
      const storeId = r.platformIds[platform];
      if (!storeId) continue;
      const adapter = adapters[platform];
      for (let h = hours; h >= 0; h -= 1) {
        const at = new Date(end.getTime() - h * 3600 * 1000);
        const offer = adapter.fetchOfferSync(storeId, r.location.zip, cart, at);
        out.push({
          restaurantId: id,
          platformSlug: platform,
          total: offer.total,
          deliveryFee: offer.deliveryFee,
          etaMin: offer.etaMin,
          promoApplied: false,
          capturedAt: at,
        });
      }
    }
  }
  return out;
}
