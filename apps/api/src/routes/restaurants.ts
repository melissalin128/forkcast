import { Router, type Request } from 'express';
import { z } from 'zod';
import { getRepo } from '../db';
import { computeBestWindow, dayName } from '../pricing/bestWindow';
import { normalizeSubscription } from '../pricing/computeTotal';
import { PLATFORM_SLUGS, type PlatformSlug, type Restaurant } from '../models/types';
import { distanceFromZip } from '../services/geo';
import { priceRestaurant, type PricingContext, type RestaurantOffers } from '../services/offers';
import { notFound } from './errors';

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

    res.json({
      zip: q.zip ?? null,
      sort: q.sort,
      subscriptions: ctx.subscriptions,
      activePromos: ctx.promos.length,
      count: results.length,
      results,
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
      ...card(r, priced, q.zip),
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
