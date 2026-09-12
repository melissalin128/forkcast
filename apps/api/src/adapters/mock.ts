/**
 * Mock adapter: realistic fee structures with hour-of-day and day-of-week
 * curves, fully deterministic, so the demo never depends on three live sites
 * behaving (spec section 6). Every number is derived from a hash of
 * (platform, store id, time bucket), so the same query at the same hour
 * always returns the same offer and seeded history lines up with live calls.
 */
import type { Offer, PlatformSlug } from '../models/types';
import { computeTotal, round2 } from '../pricing/computeTotal';
import { findByPlatformId, restaurants, unit } from '../seed/data';
import { NotImplementedError, type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

/** Sales tax in Allegheny County, applied to the (marked-up) food subtotal. */
export const TAX_RATE = 0.07;

interface FeeProfile {
  /** Menu markup vs. in-store price. */
  markup: number;
  /** Delivery fee range [min, max] before time-of-day curves. */
  delivery: [number, number];
  /** Service fee as a share of subtotal, with floor and cap. */
  service: { pct: number; min: number; max: number };
  /** Small order fee and the subtotal below which it kicks in. */
  smallOrder: { fee: number; below: number };
  /** Base ETA window [min, max] in minutes. */
  eta: [number, number];
}

export const FEE_PROFILES: Record<PlatformSlug, FeeProfile> = {
  doordash: { markup: 1.12, delivery: [1.99, 5.99], service: { pct: 0.15, min: 3, max: 8 }, smallOrder: { fee: 3, below: 12 }, eta: [25, 45] },
  ubereats: { markup: 1.15, delivery: [0.99, 4.99], service: { pct: 0.15, min: 3, max: 9 }, smallOrder: { fee: 3, below: 15 }, eta: [20, 40] },
  grubhub: { markup: 1.08, delivery: [1.49, 4.99], service: { pct: 0.1, min: 2.5, max: 7 }, smallOrder: { fee: 2, below: 12 }, eta: [30, 50] },
};

/**
 * Demand multiplier applied to delivery fees and ETAs.
 *  - dinner peak 17:00-20:59: +15% at the shoulders, +25% at 18-19
 *  - Friday / Saturday: +10% on top
 *  - Tuesday / Wednesday 14:00-16:59: -15% (the "best time to order" window)
 *  - small bumps for lunch and late night so the curve is not flat
 */
export function demandMultiplier(at: Date): number {
  const hour = at.getHours();
  const dow = at.getDay(); // 0 Sun .. 6 Sat
  let m = 1;

  if (hour >= 17 && hour <= 20) {
    m *= hour === 18 || hour === 19 ? 1.25 : 1.15;
  } else if (hour >= 11 && hour <= 13) {
    m *= 1.08;
  } else if (hour >= 22 || hour <= 1) {
    m *= 1.1;
  } else if (hour >= 2 && hour <= 6) {
    m *= 1.2; // almost no dashers on the road
  }

  if (dow === 5 || dow === 6) m *= 1.1;
  if ((dow === 2 || dow === 3) && hour >= 14 && hour <= 16) m *= 0.85;

  return m;
}

/** Floor a date to its hour so the curve is stable within an hour. */
export function hourBucket(at: Date): Date {
  const d = new Date(at);
  d.setMinutes(0, 0, 0);
  return d;
}

export class MockAdapter implements PlatformAdapter {
  constructor(readonly platformSlug: PlatformSlug) {}

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    const q = query.trim().toLowerCase();
    return restaurants
      .filter((r) => r.platformIds[this.platformSlug])
      .filter((r) => !zip || zip.startsWith('152')) // demo service area: Pittsburgh
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.cuisine.some((c) => c.toLowerCase().includes(q)))
      .map<PlatformListing>((r) => ({
        platformSlug: this.platformSlug,
        platformRestaurantId: r.platformIds[this.platformSlug] as string,
        name: r.name,
        address: r.address,
        zip: r.location.zip,
        cuisine: r.cuisine,
        rating: r.rating,
        ratingCount: r.ratingCount,
        imageUrl: r.imageUrl,
        url: this.storeUrl(r.platformIds[this.platformSlug] as string),
      }));
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    return this.fetchOfferSync(platformRestaurantId, zip, cart, options.at ?? new Date());
  }

  /**
   * Synchronous core so the seed can generate thousands of snapshots without
   * touching the event loop. Everything is a pure function of (store, cart, hour).
   */
  fetchOfferSync(platformRestaurantId: string, zip: string, cart: Cart, at: Date): Offer {
    void zip; // the demo service area is flat; the zip only matters for live adapters
    const restaurant = findByPlatformId(this.platformSlug, platformRestaurantId);
    if (!restaurant && cart.length === 0) {
      throw new NotImplementedError(`mock adapter has no catalog entry for ${this.platformSlug}:${platformRestaurantId}`);
    }
    const profile = FEE_PROFILES[this.platformSlug];
    const key = `${this.platformSlug}:${platformRestaurantId}`;
    const bucket = hourBucket(at);
    const bucketKey = `${key}:${bucket.toISOString()}`;

    // --- subtotal: menu price x platform markup ------------------------------
    const menuSubtotal =
      cart.length > 0
        ? cart.reduce((sum, c) => sum + (c.unitPrice ?? restaurant?.sampleItem.menuPrice ?? 12) * c.quantity, 0)
        : (restaurant?.sampleItem.menuPrice ?? 12);
    const subtotal = round2(menuSubtotal * profile.markup);

    // --- fees -----------------------------------------------------------------
    const m = demandMultiplier(at);
    const jitter = 1 + (unit(`jitter:${bucketKey}`) - 0.5) * 0.06; // +/-3% per hour bucket
    const baseDelivery = profile.delivery[0] + unit(`delivery:${key}`) * (profile.delivery[1] - profile.delivery[0]);
    const deliveryFee = round2(Math.max(0, baseDelivery * m * jitter));
    // Service fee also rises at peak: platforms add a "busy area" surcharge that lands on this line.
    const busySurcharge = m > 1 ? 1 + (m - 1) * 0.8 : 1;
    const serviceFee = round2(
      Math.min(profile.service.max * busySurcharge, Math.max(profile.service.min, subtotal * profile.service.pct)) * busySurcharge,
    );
    const smallOrderFee = subtotal < profile.smallOrder.below ? profile.smallOrder.fee : 0;
    const tax = round2(subtotal * TAX_RATE);

    // --- ETA -------------------------------------------------------------------
    const baseEta = profile.eta[0] + unit(`eta:${key}`) * (profile.eta[1] - profile.eta[0]);
    const etaMin = Math.round(baseEta * m);
    const etaMax = etaMin + 10 + Math.round(unit(`etaspread:${key}`) * 10);

    const fees = { platformSlug: this.platformSlug, subtotal, serviceFee, deliveryFee, smallOrderFee, tax };
    const { total } = computeTotal(fees, [], [], 0.15, at);

    return {
      restaurantId: restaurant?.id ?? platformRestaurantId,
      platformSlug: this.platformSlug,
      platformRestaurantId,
      subtotal,
      serviceFee,
      deliveryFee,
      smallOrderFee,
      tax,
      total,
      etaMin,
      etaMax,
      fetchedAt: at,
    };
  }

  storeUrl(platformRestaurantId: string): string {
    switch (this.platformSlug) {
      case 'doordash':
        return `https://www.doordash.com/store/${platformRestaurantId}/`;
      case 'ubereats':
        return `https://www.ubereats.com/store/${platformRestaurantId}`;
      case 'grubhub':
        return `https://www.grubhub.com/restaurant/${platformRestaurantId}`;
    }
  }
}
