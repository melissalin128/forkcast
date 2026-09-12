import { Router, type Request } from 'express';
import { z } from 'zod';
import { getRepo } from '../db';
import { computeBestWindow, dayName } from '../pricing/bestWindow';
import { normalizeSubscription } from '../pricing/computeTotal';
import { PLATFORM_SLUGS, type PlatformSlug, type Restaurant } from '../models/types';
import { distanceFromZip } from '../services/geo';
import { priceRestaurant, type PricingContext, type RestaurantOffers } from '../services/offers';
import { notFound } from './errors';
import { adapterMode } from '../adapters';

export const restaurantsRouter = Router();

const csv = (v: unknown): string[] =>
  typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const listQuery = z.object({
  zip: z.string().regex(/^\d{5}$/, 'zip must be 5 digits').optional(),
  q: z.string().trim().max(100).optional(),
  cuisine: z.string().trim().max(50).optional(),
  dietary: z.string().optional(),
  maxTotal: z.coerce.number().positive().optional(),
  maxEta: z.coerce.number().int().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(['cheapest', 'fastest', 'rated', 'cheapestFee']).default('cheapest'),
  subs: z.string().optional(),
  tip: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

const detailQuery = listQuery.pick({ zip: true, subs: true, tip: true }).extend({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

async function buildContext(req: Request, parsed: { zip?: string; subs?: string; tip?: number }): Promise<PricingContext> {
  const repo = getRepo();
  const now = new Date();
  const [platforms, promos] = await Promise.all([repo.listPlatforms(), repo.listActivePromos(now)]);
  const subscriptions = csv(parsed.subs)
    .map(normalizeSubscription)
    .filter((s): s is NonNullable<typeof s> => s !== null);
  void req;
  return { repo, platforms, promos, subscriptions, zip: parsed.zip, tipPct: parsed.tip, now };
}

function card(r: Restaurant, priced: RestaurantOffers, zip?: string) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    address: r.address,
    cuisine: r.cuisine,
    dietaryTags: r.dietaryTags,
    rating: r.rating,
    ratingCount: r.ratingCount,
    priceTier: r.priceTier,
    location: r.location,
    distanceMi: distanceFromZip(zip, r.location.geo),
    imageUrl: r.imageUrl,
    sampleItem: r.sampleItem,
    platformIds: r.platformIds,
    offers: priced.offers,
    unavailable: priced.unavailable,
    best: priced.best ? { platformSlug: priced.best.platformSlug, total: priced.best.total, etaMin: priced.best.etaMin, etaMax: priced.best.etaMax } : null,
    worstTotal: priced.worst?.total ?? null,
    savings: priced.savings,
  };
}

/**
 * Public client contract used by both the React and Expo apps. Keep the
 * richer API fields above for debugging/backwards compatibility, but always
 * include the fields the delivery-app UI needs so live data never silently
 * falls back to its bundled catalog.
 */
function clientCard(r: Restaurant, priced: RestaurantOffers, zip?: string, tipPct = 0.15) {
  const base = card(r, priced, zip);
  const menuPrices = Object.fromEntries(
    priced.offers.map((offer) => [offer.platformSlug, offer.subtotal]),
  );
  const known = ['Grocery', 'Pizza', 'Burgers', 'Ramen', 'Indian', 'Mexican', 'Thai', 'Sushi', 'Chinese'];
  const category = known.find((name) => r.cuisine.some((c) => c.toLowerCase() === name.toLowerCase())) ?? r.cuisine[0] ?? 'All';
  return {
    ...base,
    category,
    menu: [{ name: r.sampleItem.name, price: r.sampleItem.menuPrice, prices: menuPrices }],
    order: [{ name: r.sampleItem.name, qty: 1 }],
    orderLabel: r.sampleItem.name,
    tipPct: Math.round(tipPct * 100),
    openUntil: 'hours vary',
    image: 'linear-gradient(135deg, #f6dcc6, #e9b48c)',
  };
}

const refreshedAt = (rows: ReturnType<typeof clientCard>[]) =>
  rows
    .flatMap((row) => row.offers.map((offer) => offer.fetchedAt))
    .sort()
    .at(-1) ?? new Date().toISOString();

type Card = ReturnType<typeof card>;

const sorters: Record<z.infer<typeof listQuery>['sort'], (a: Card, b: Card) => number> = {
  cheapest: (a, b) => (a.best?.total ?? Infinity) - (b.best?.total ?? Infinity),
  fastest: (a, b) => minEta(a) - minEta(b),
  rated: (a, b) => b.rating - a.rating || (a.best?.total ?? Infinity) - (b.best?.total ?? Infinity),
  cheapestFee: (a, b) => minFee(a) - minFee(b),
};
const minEta = (c: Card) => (c.offers.length ? Math.min(...c.offers.map((o) => o.etaMax)) : Infinity);
const minFee = (c: Card) => (c.offers.length ? Math.min(...c.offers.map((o) => o.deliveryFee)) : Infinity);

// GET /api/restaurants
restaurantsRouter.get('/restaurants', async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const ctx = await buildContext(req, q);
    const restaurants = await ctx.repo.listRestaurants({
      zip: q.zip,
      q: q.q,
      cuisine: q.cuisine,
      dietary: csv(q.dietary),
      minRating: q.minRating,
    });

    const cards = await Promise.all(restaurants.map(async (r) => card(r, await priceRestaurant(ctx, r), q.zip)));

    let results = cards.filter((c) => c.offers.length > 0 || c.unavailable.length === 0);
    if (q.maxTotal !== undefined) results = results.filter((c) => c.best !== null && c.best.total <= q.maxTotal!);
    if (q.maxEta !== undefined) results = results.filter((c) => minEta(c) <= q.maxEta!);
    results.sort(sorters[q.sort]);
    results = results.slice(0, q.limit);

    const clientRows = await Promise.all(results.map(async (row) => {
      const restaurant = await ctx.repo.getRestaurant(row.id);
      if (!restaurant) return null;
      return clientCard(restaurant, { offers: row.offers, unavailable: row.unavailable, best: row.offers[0] ?? null, worst: row.offers.at(-1) ?? null, savings: row.savings }, q.zip, q.tip ?? 0.15);
    }));
    const clientRestaurants = clientRows.filter((row): row is NonNullable<typeof row> => row !== null);

    res.json({
      zip: q.zip ?? null,
      sort: q.sort,
      subscriptions: ctx.subscriptions,
      activePromos: ctx.promos.length,
      count: results.length,
      results,
      restaurants: clientRestaurants,
      refreshedAt: refreshedAt(clientRestaurants),
      dataMode: adapterMode() === 'mock' ? 'demo' : 'live',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/:id/history
restaurantsRouter.get('/restaurants/:id/history', async (req, res, next) => {
  try {
    const days = z.coerce.number().int().min(1).max(30).default(7).parse(req.query.days);
    const repo = getRepo();
    const restaurant = await repo.getRestaurant(req.params.id);
    if (!restaurant) throw notFound('restaurant');
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const snapshots = await repo.listSnapshots(restaurant.id, since, now);
    res.json({
      restaurantId: restaurant.id,
      snapshots: snapshots.map((snapshot) => ({
        restaurantId: snapshot.restaurantId,
        platformSlug: snapshot.platformSlug,
        total: snapshot.total,
        deliveryFee: snapshot.deliveryFee,
        etaMin: snapshot.etaMin,
        promoApplied: snapshot.promoApplied,
        capturedAt: new Date(snapshot.capturedAt).toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/:id
restaurantsRouter.get('/restaurants/:id', async (req, res, next) => {
  try {
    const q = detailQuery.parse(req.query);
    const ctx = await buildContext(req, q);
    const r = await ctx.repo.getRestaurant(req.params.id);
    if (!r) throw notFound('restaurant');

    const priced = await priceRestaurant(ctx, r);
    const since = new Date(ctx.now!.getTime() - q.days * 24 * 3600 * 1000);
    const snapshots = await ctx.repo.listSnapshots(r.id, since, ctx.now);

    const history = PLATFORM_SLUGS.filter((p) => r.platformIds[p]).map((platformSlug: PlatformSlug) => ({
      platformSlug,
      points: snapshots
        .filter((s) => s.platformSlug === platformSlug)
        .map((s) => ({ capturedAt: new Date(s.capturedAt).toISOString(), total: s.total, deliveryFee: s.deliveryFee, etaMin: s.etaMin, promoApplied: s.promoApplied })),
    }));

    const window = computeBestWindow(snapshots, priced.best?.listTotal ?? null);
    const bestWindow = window
      ? {
          ...window,
          dayName: dayName(window.dayOfWeek),
          label: `${dayName(window.dayOfWeek)} ${fmtHour(window.startHour)}-${fmtHour(window.endHour)} is on average ${window.pctBelowNow}% cheaper than now`,
        }
      : null;

    res.json({
      ...clientCard(r, priced, q.zip, q.tip ?? 0.15),
      dataMode: adapterMode() === 'mock' ? 'demo' : 'live',
      subscriptions: ctx.subscriptions,
      history,
      historyDays: q.days,
      bestWindow,
    });
  } catch (err) {
    next(err);
  }
});

function fmtHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh >= 12 ? 'pm' : 'am';
  const twelve = hh % 12 === 0 ? 12 : hh % 12;
  return `${twelve}${suffix}`;
}
