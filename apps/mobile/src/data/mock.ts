import type { Offer, Platform, PlatformSlug, PriceSnapshot, Promo, Restaurant } from '../types';
import data from './generated/restaurants.json';

/**
 * Demo anchor. The artboards describe "Friday 7:12 pm is a peak hour", so the
 * mock world is frozen there: prices, the chart's "now" marker and the
 * best-time callout all derive from this instant. Built with the local-time
 * constructor so the weekday is Friday in every timezone.
 */
export const NOW = new Date(2026, 8, 11, 19, 12, 0);
export const ZIP = '15213';
/** Zips the bundled restaurants are in. Not a gate: every zip gets the whole list. */
export const COVERED_ZIPS: readonly string[] = data.zips;
export const REFRESHED_AT = new Date(NOW.getTime() - 3 * 60_000).toISOString();

export const PLATFORMS: Platform[] = [
  {
    slug: 'doordash',
    name: 'DoorDash',
    brandColor: '#ff3008',
    subscriptionName: 'DashPass',
    subscriptionPerks: ['$0 delivery fee', 'reduced service fee'],
    deepLink: 'https://www.doordash.com/search/store/{q}/',
  },
  {
    slug: 'ubereats',
    name: 'Uber Eats',
    brandColor: '#06c167',
    subscriptionName: 'Uber One',
    subscriptionPerks: ['$0 delivery fee on $15+', '5% off eligible orders'],
    deepLink: 'https://www.ubereats.com/search?q={q}',
  },
  {
    slug: 'grubhub',
    name: 'Grubhub',
    brandColor: '#f63440',
    subscriptionName: 'Grubhub+',
    subscriptionPerks: ['$0 delivery fee on $12+', '5% back in credit'],
    deepLink: 'https://www.grubhub.com/search?queryText={q}',
  },
];

export const PLATFORM_BY_SLUG: Record<PlatformSlug, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.slug, p]),
) as Record<PlatformSlug, Platform>;

// ---------------------------------------------------------------------------
// Promos (spec D4: first-class and time-bounded)
// ---------------------------------------------------------------------------

const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

export const PROMOS: Record<string, Promo> = {
  GH2OFF: {
    platformSlug: 'grubhub',
    code: 'GH2OFF',
    rule: { type: 'flat', value: 2, minSubtotal: 15 },
    startsAt: hoursFromNow(-3.3),
    endsAt: hoursFromNow(2.67),
    label: '$2 off $15+',
    eligible: true,
  },
  EATS20: {
    platformSlug: 'ubereats',
    code: 'EATS20',
    rule: { type: 'percent', value: 20 },
    startsAt: hoursFromNow(-48),
    endsAt: hoursFromNow(120),
    label: '20% off first order',
    eligible: false,
    note: 'you have ordered before',
  },
  SPICY20: {
    platformSlug: 'ubereats',
    code: 'SPICY20',
    rule: { type: 'percent', value: 20, minSubtotal: 20 },
    startsAt: hoursFromNow(-5),
    endsAt: hoursFromNow(1.5),
    label: '20% off $20+',
    eligible: true,
  },
  DDFREE: {
    platformSlug: 'doordash',
    code: 'DASHFREE',
    rule: { type: 'freeDelivery', value: 0, minSubtotal: 12 },
    startsAt: hoursFromNow(-24),
    endsAt: hoursFromNow(6),
    label: 'Free delivery on $12+',
    eligible: false,
    note: 'already included in DashPass',
  },
};

// ---------------------------------------------------------------------------
// Restaurants: the real dataset, exported read-only from MongoDB by
// apps/api/src/ingest/exportAppData.ts (see generated/README.md). Names,
// photos and menu prices are observed; every offer (fees, ETA, total) is
// modelled. The full menus live in generated/menus.json, which only the Store
// page loads.
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

// The exporter's offers carry the live API's gaps (no restaurantId,
// promo: null, no subscriptionApplied); the UI already copes with those.
export const RESTAURANTS = data.restaurants as unknown as Restaurant[];

// ---------------------------------------------------------------------------
// Price history: 7 days x 24 hours per platform, deterministic.
// ---------------------------------------------------------------------------

/** mulberry32 — tiny seeded PRNG so the chart is identical on every load. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0..1 dinner-peak curve (17-20h), with a smaller lunch bump and a late dip. */
export function hourCurve(hour: number): number {
  const dinner = Math.exp(-((hour - 18.6) ** 2) / (2 * 1.35 ** 2));
  const lunch = 0.35 * Math.exp(-((hour - 12.4) ** 2) / (2 * 0.9 ** 2));
  const late = hour >= 22 || hour <= 1 ? -0.12 : 0;
  const dead = hour >= 2 && hour < 10 ? -0.2 : 0;
  return dinner + lunch + late + dead;
}

/** Weekend multiplier on top of the hour curve. Sunday=0 ... Saturday=6. */
export function dayBump(dow: number): number {
  return [0.45, -0.1, -0.25, -0.3, 0.05, 0.7, 0.95][dow] ?? 0;
}

export const HISTORY_HOURS = 7 * 24;

export function generateHistory(restaurant: Restaurant, offer: Offer): PriceSnapshot[] {
  const rand = prng(hashString(`${restaurant.id}/${offer.platformSlug}`));
  // How hard dinner peak hits this place, $0.80–$2.60, fixed per restaurant.
  const amp = 0.8 + (hashString(restaurant.id) % 19) / 10;

  // Smooth, mean-reverting noise so the line wobbles instead of buzzing.
  const noise: number[] = [];
  let n = 0;
  for (let i = 0; i < HISTORY_HOURS; i++) {
    n = n * 0.72 + (rand() - 0.5) * 0.6;
    noise.push(n);
  }

  const shape = (d: Date) => amp * hourCurve(d.getHours()) + amp * 0.7 * dayBump(d.getDay());
  // A promo is applied from its start time until now.
  const promoStart = offer.promo ? Date.parse(offer.promo.startsAt) : Infinity;
  const promoFor = (at: Date) => at.getTime() >= promoStart;

  // Anchor the series so the final point equals the live offer.
  const last = HISTORY_HOURS - 1;
  const base =
    offer.total -
    shape(NOW) -
    noise[last] +
    (promoFor(NOW) ? offer.promoDiscount : 0);

  const out: PriceSnapshot[] = [];
  for (let i = 0; i < HISTORY_HOURS; i++) {
    const at = i === last ? NOW : new Date(NOW.getTime() - (last - i) * 3_600_000);
    if (i !== last) at.setMinutes(0, 0, 0);
    const curve = hourCurve(at.getHours());
    const promoApplied = promoFor(at);
    const raw = base + shape(at) + noise[i] - (promoApplied ? offer.promoDiscount : 0);
    const total = i === last ? offer.total : round2(Math.max(offer.subtotal + 1, raw));
    out.push({
      restaurantId: restaurant.id,
      platformSlug: offer.platformSlug,
      total,
      deliveryFee: round2(offer.deliveryFee + Math.max(0, curve) * amp * 0.35),
      etaMin: Math.round(offer.etaMin + Math.max(0, curve) * 9),
      promoApplied,
      capturedAt: at.toISOString(),
    });
  }
  return out;
}

const historyCache = new Map<string, PriceSnapshot[]>();

export function mockHistory(restaurantId: string): PriceSnapshot[] {
  const cached = historyCache.get(restaurantId);
  if (cached) return cached;
  const r = RESTAURANTS.find((x) => x.id === restaurantId);
  if (!r) return [];
  const rows = r.offers.flatMap((o) => generateHistory(r, o));
  historyCache.set(restaurantId, rows);
  return rows;
}
