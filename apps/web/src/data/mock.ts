import type {
  Offer,
  OrderLine,
  Platform,
  PlatformSlug,
  PriceSnapshot,
  Promo,
  Restaurant,
} from '../types';

/**
 * Demo anchor. The artboards describe "Friday 7:12 pm is a peak hour", so the
 * mock world is frozen there: prices, the chart's "now" marker and the
 * best-time callout all derive from this instant. Built with the local-time
 * constructor so the weekday is Friday in every timezone.
 */
export const NOW = new Date(2026, 8, 11, 19, 12, 0);
export const ZIP = '15213';
export const REFRESHED_AT = new Date(NOW.getTime() - 3 * 60_000).toISOString();

/** Passes the demo user pays for (spec D3: subscriptions are an input). */
export const USER_SUBSCRIPTIONS: PlatformSlug[] = ['doordash', 'ubereats'];

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
// Offers
// ---------------------------------------------------------------------------

interface OfferSeed {
  subtotal: number;
  /** service + delivery + small-order + tax + tip, as one number for readability. */
  fees: number;
  promo?: Promo;
  eta: [number, number];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function makeOffer(restaurantId: string, slug: PlatformSlug, seed: OfferSeed): Offer {
  const subscriptionApplied = USER_SUBSCRIPTIONS.includes(slug);
  const tip = round2(seed.subtotal * 0.15);
  const tax = round2(seed.subtotal * 0.07);
  const remainder = Math.max(0, round2(seed.fees - tip - tax));
  // With a pass the delivery fee is waived and everything left is service fee.
  const deliveryFee = subscriptionApplied ? 0 : round2(Math.min(remainder, 2.99));
  const smallOrderFee = seed.subtotal < 12 ? 2 : 0;
  const serviceFee = round2(remainder - deliveryFee - smallOrderFee);
  const promoDiscount = seed.promo
    ? seed.promo.rule.type === 'percent'
      ? round2(seed.subtotal * (seed.promo.rule.value / 100))
      : seed.promo.rule.type === 'flat'
        ? seed.promo.rule.value
        : deliveryFee
    : 0;
  return {
    restaurantId,
    platformSlug: slug,
    subtotal: seed.subtotal,
    serviceFee,
    deliveryFee,
    smallOrderFee,
    tax,
    tip,
    promoDiscount,
    total: round2(seed.subtotal + seed.fees - promoDiscount),
    etaMin: seed.eta[0],
    etaMax: seed.eta[1],
    promo: seed.promo,
    subscriptionApplied,
    fetchedAt: REFRESHED_AT,
  };
}

interface RestaurantSeed {
  id: string;
  name: string;
  cuisine: string[];
  dietaryTags: string[];
  rating: number;
  ratingCount: number;
  priceTier: 1 | 2 | 3;
  distanceMi: number;
  openUntil: string;
  image: string;
  order: OrderLine[];
  orderLabel: string;
  /** How hard dinner peak hits this restaurant's totals, in dollars. */
  peakAmp: number;
  offers: Partial<Record<PlatformSlug, OfferSeed>>;
}

const SEEDS: RestaurantSeed[] = [
  {
    id: 'ramen-bar-oakland',
    name: 'Ramen Bar Oakland',
    cuisine: ['Ramen', 'Japanese'],
    dietaryTags: [],
    rating: 4.7,
    ratingCount: 1240,
    priceTier: 2,
    distanceMi: 0.6,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #2a2420, #3a2d22)',
    order: [
      { name: 'Tonkotsu ramen', qty: 1 },
      { name: 'Pork gyoza (6)', qty: 1 },
    ],
    orderLabel: 'Tonkotsu ramen + gyoza, delivered',
    peakAmp: 2.4,
    offers: {
      grubhub: { subtotal: 18.5, fees: 4.9, promo: PROMOS.GH2OFF, eta: [28, 38] },
      doordash: { subtotal: 19.75, fees: 5.1, eta: [24, 34] },
      ubereats: { subtotal: 20.9, fees: 5.6, eta: [31, 41] },
    },
  },
  {
    id: 'mad-mex-shadyside',
    name: 'Mad Mex Shadyside',
    cuisine: ['Mexican', 'Tex-Mex'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.5,
    ratingCount: 860,
    priceTier: 2,
    distanceMi: 1.1,
    openUntil: '11 pm',
    image: 'linear-gradient(135deg, #2d2220, #402a22)',
    order: [
      { name: 'Big Azz Burrito', qty: 1 },
      { name: 'Chips & queso', qty: 1 },
    ],
    orderLabel: 'Burrito + chips & queso, delivered',
    peakAmp: 1.8,
    offers: {
      doordash: { subtotal: 14.95, fees: 4.0, eta: [22, 32] },
      ubereats: { subtotal: 15.6, fees: 4.5, eta: [26, 36] },
      grubhub: { subtotal: 16.25, fees: 5.9, eta: [35, 45] },
    },
  },
  {
    id: 'sichuan-gourmet',
    name: 'Sichuan Gourmet',
    cuisine: ['Chinese', 'Sichuan'],
    dietaryTags: ['Vegan options'],
    rating: 4.6,
    ratingCount: 2300,
    priceTier: 2,
    distanceMi: 0.9,
    openUntil: '9:30 pm',
    image: 'linear-gradient(135deg, #24261f, #2f3a22)',
    order: [
      { name: 'Mapo tofu', qty: 1 },
      { name: 'Dan dan noodles', qty: 1 },
    ],
    orderLabel: 'Mapo tofu + dan dan noodles, delivered',
    peakAmp: 2.1,
    offers: {
      ubereats: { subtotal: 23.0, fees: 5.2, promo: PROMOS.SPICY20, eta: [29, 39] },
      grubhub: { subtotal: 22.1, fees: 4.95, eta: [33, 43] },
      doordash: { subtotal: 23.5, fees: 5.4, eta: [25, 35] },
    },
  },
  {
    id: 'pizza-milano',
    name: 'Pizza Milano',
    cuisine: ['Pizza', 'Italian'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.3,
    ratingCount: 540,
    priceTier: 1,
    distanceMi: 0.4,
    openUntil: '2 am',
    image: 'linear-gradient(135deg, #2a2320, #3b2a26)',
    order: [
      { name: 'Large cheese pizza', qty: 1 },
      { name: 'Garlic knots', qty: 1 },
    ],
    orderLabel: 'Large cheese + garlic knots, delivered',
    peakAmp: 1.4,
    offers: {
      grubhub: { subtotal: 13.0, fees: 3.2, eta: [19, 29] },
      doordash: { subtotal: 13.75, fees: 4.2, eta: [21, 31] },
    },
  },
  {
    id: 'prince-of-india',
    name: 'Prince of India',
    cuisine: ['Indian'],
    dietaryTags: ['Halal', 'Vegetarian options'],
    rating: 4.8,
    ratingCount: 990,
    priceTier: 2,
    distanceMi: 1.4,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #262420, #3a3222)',
    order: [
      { name: 'Chicken tikka masala', qty: 1 },
      { name: 'Garlic naan', qty: 2 },
    ],
    orderLabel: 'Tikka masala + 2 naan, delivered',
    peakAmp: 4.6,
    offers: {
      ubereats: { subtotal: 21.5, fees: 5.8, eta: [38, 48] },
      doordash: { subtotal: 22.4, fees: 6.7, eta: [34, 44] },
      grubhub: { subtotal: 23.1, fees: 7.35, eta: [41, 51] },
    },
  },
  {
    id: 'bangkok-balcony',
    name: 'Bangkok Balcony',
    cuisine: ['Thai'],
    dietaryTags: ['Vegan options', 'Gluten-free options'],
    rating: 4.4,
    ratingCount: 710,
    priceTier: 2,
    distanceMi: 0.8,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #22261f, #2c3a2a)',
    order: [
      { name: 'Pad see ew', qty: 1 },
      { name: 'Thai iced tea', qty: 1 },
    ],
    orderLabel: 'Pad see ew + Thai iced tea, delivered',
    peakAmp: 1.6,
    offers: {
      doordash: { subtotal: 15.6, fees: 4.2, eta: [27, 37] },
      grubhub: { subtotal: 16.1, fees: 5.05, eta: [30, 40] },
      ubereats: { subtotal: 16.8, fees: 5.4, eta: [32, 42] },
    },
  },
  {
    id: 'burgatory-waterfront',
    name: 'Burgatory Waterfront',
    cuisine: ['Burgers', 'American'],
    dietaryTags: [],
    rating: 4.5,
    ratingCount: 1800,
    priceTier: 2,
    distanceMi: 2.1,
    openUntil: '11 pm',
    image: 'linear-gradient(135deg, #2b2220, #3d2c24)',
    order: [
      { name: 'Piggy burger', qty: 1 },
      { name: 'Truffle fries', qty: 1 },
    ],
    orderLabel: 'Piggy burger + truffle fries, delivered',
    peakAmp: 2.0,
    offers: {
      doordash: { subtotal: 13.6, fees: 3.8, eta: [26, 36] },
      ubereats: { subtotal: 14.4, fees: 4.85, eta: [29, 39] },
    },
  },
  {
    id: 'sushi-fuku',
    name: 'Sushi Fuku',
    cuisine: ['Sushi', 'Japanese'],
    dietaryTags: ['Gluten-free options'],
    rating: 4.6,
    ratingCount: 640,
    priceTier: 2,
    distanceMi: 0.5,
    openUntil: '9 pm',
    image: 'linear-gradient(135deg, #23252a, #2c3340)',
    order: [
      { name: 'Salmon poke bowl', qty: 1 },
      { name: 'Miso soup', qty: 1 },
    ],
    orderLabel: 'Salmon poke + miso, delivered',
    peakAmp: 1.5,
    offers: {
      ubereats: { subtotal: 17.4, fees: 4.7, eta: [21, 31] },
      doordash: { subtotal: 18.2, fees: 5.15, eta: [24, 34] },
      grubhub: { subtotal: 18.9, fees: 5.9, eta: [33, 43] },
    },
  },
  {
    id: 'salems-market-grill',
    name: "Salem's Market & Grill",
    cuisine: ['Halal', 'Mediterranean'],
    dietaryTags: ['Halal'],
    rating: 4.7,
    ratingCount: 1100,
    priceTier: 1,
    distanceMi: 1.9,
    openUntil: '9 pm',
    image: 'linear-gradient(135deg, #27231e, #3a3120)',
    order: [{ name: 'Chicken shawarma platter', qty: 1 }],
    orderLabel: 'Shawarma platter, delivered',
    peakAmp: 1.2,
    offers: {
      grubhub: { subtotal: 12.5, fees: 3.4, eta: [30, 40] },
      ubereats: { subtotal: 13.25, fees: 4.95, eta: [28, 38] },
    },
  },
  {
    id: 'noodlehead',
    name: 'Noodlehead',
    cuisine: ['Thai', 'Noodles'],
    dietaryTags: ['Vegan options'],
    rating: 4.6,
    ratingCount: 1500,
    priceTier: 1,
    distanceMi: 0.7,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #25261f, #343a24)',
    order: [
      { name: 'Khao soi', qty: 1 },
      { name: 'Crispy spring rolls', qty: 1 },
    ],
    orderLabel: 'Khao soi + spring rolls, delivered',
    peakAmp: 1.7,
    offers: {
      doordash: { subtotal: 14.2, fees: 3.95, eta: [23, 33] },
      ubereats: { subtotal: 14.6, fees: 4.4, eta: [25, 35] },
      grubhub: { subtotal: 15.1, fees: 5.2, eta: [29, 39] },
    },
  },
];

const PEAK_AMP: Record<string, number> = Object.fromEntries(SEEDS.map((s) => [s.id, s.peakAmp]));

export const RESTAURANTS: Restaurant[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  cuisine: s.cuisine,
  dietaryTags: s.dietaryTags,
  rating: s.rating,
  ratingCount: s.ratingCount,
  priceTier: s.priceTier,
  distanceMi: s.distanceMi,
  openUntil: s.openUntil,
  location: { zip: ZIP, geo: { lat: 40.4443, lng: -79.9608 } },
  platformIds: Object.fromEntries(
    Object.keys(s.offers).map((slug) => [slug, `${slug}:${s.id}`]),
  ) as Partial<Record<PlatformSlug, string>>,
  image: s.image,
  order: s.order,
  orderLabel: s.orderLabel,
  tipPct: 15,
  offers: (Object.entries(s.offers) as [PlatformSlug, OfferSeed][]).map(([slug, seed]) =>
    makeOffer(s.id, slug, seed),
  ),
}));

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
  const amp = PEAK_AMP[restaurant.id] ?? 2;

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

// Derive `peakSurcharge` from the generated history: cheapest total right now
// versus that platform's 7-day average.
for (const r of RESTAURANTS) {
  const best = [...r.offers].sort((a, b) => a.total - b.total)[0];
  if (!best) continue;
  const rows = mockHistory(r.id).filter((s) => s.platformSlug === best.platformSlug);
  const mean = rows.reduce((sum, s) => sum + s.total, 0) / rows.length;
  r.peakSurcharge = Math.round((best.total - mean) * 10) / 10;
}
