/**
 * Turns a Restaurant into priced per-platform offers:
 *   cached offer (<= 10 min) or adapter.fetchOffer -> saveOffer + appendSnapshot
 *   -> computeTotal(offer, subscriptions, activePromos)
 */
import { getAdapters } from '../adapters';
import { cartForRestaurant } from '../adapters/types';
import { config } from '../config';
import type { Offer, Platform, PlatformSlug, Promo, Restaurant } from '../models/types';
import { computeTotal, type TotalBreakdown } from '../pricing/computeTotal';
import type { Repository } from '../repo';

export interface PricedOffer extends TotalBreakdown {
  platformSlug: PlatformSlug;
  platformName: string;
  brandColor: string;
  platformRestaurantId: string;
  /** Delivered total with no subscription / promo, as the platform shows it. */
  listTotal: number;
  etaMin: number;
  etaMax: number;
  deepLink: string;
  fetchedAt: string;
  promo?: { code: string; description?: string; endsAt: string } | null;
}

export interface UnavailableOffer {
  platformSlug: PlatformSlug;
  platformName: string;
  brandColor: string;
  platformRestaurantId: string;
  error: string;
}

export interface PricingContext {
  repo: Repository;
  platforms: Platform[];
  subscriptions: string[];
  promos: Promo[];
  zip?: string;
  tipPct?: number;
  now?: Date;
}

export interface RestaurantOffers {
  offers: PricedOffer[];
  unavailable: UnavailableOffer[];
  best: PricedOffer | null;
  /** Most expensive available platform, so the card can say "save $X vs Y". */
  worst: PricedOffer | null;
  savings: number;
}

/** Returns a fresh-enough cached offer or fetches (and records) a new one. */
export async function getOffer(ctx: PricingContext, r: Restaurant, platform: PlatformSlug): Promise<Offer> {
  const now = ctx.now ?? new Date();
  const cached = (await ctx.repo.getLatestOffers(r.id)).find(
    (o) => o.platformSlug === platform && now.getTime() - new Date(o.fetchedAt).getTime() < config.offerCacheMs,
  );
  if (cached) return cached;

  const storeId = r.platformIds[platform];
  if (!storeId) throw new Error(`${r.name} is not listed on ${platform}`);
  const adapter = getAdapters()[platform];
  const fetched = await adapter.fetchOffer(storeId, ctx.zip ?? r.location.zip, cartForRestaurant(r), { at: now });
  const offer: Offer = { ...fetched, restaurantId: r.id };

  const saved = await ctx.repo.saveOffer(offer);
  await ctx.repo.appendSnapshot({
    restaurantId: r.id,
    platformSlug: platform,
    total: saved.total,
    deliveryFee: saved.deliveryFee,
    etaMin: saved.etaMin,
    promoApplied: !!saved.promo,
    capturedAt: new Date(saved.fetchedAt),
  });
  return saved;
}

export async function priceRestaurant(ctx: PricingContext, r: Restaurant): Promise<RestaurantOffers> {
  const now = ctx.now ?? new Date();
  const platformsBySlug = new Map(ctx.platforms.map((p) => [p.slug, p]));
  const adapters = getAdapters();
  const offers: PricedOffer[] = [];
  const unavailable: UnavailableOffer[] = [];

  const listed = (Object.keys(r.platformIds) as PlatformSlug[]).filter((p) => r.platformIds[p]);
  await Promise.all(
    listed.map(async (platform) => {
      const meta = platformsBySlug.get(platform);
      const base = {
        platformSlug: platform,
        platformName: meta?.name ?? platform,
        brandColor: meta?.brandColor ?? '#888888',
        platformRestaurantId: r.platformIds[platform] as string,
      };
      try {
        const offer = await getOffer(ctx, r, platform);
        const breakdown = computeTotal(offer, ctx.subscriptions, ctx.promos, ctx.tipPct ?? config.defaultTipPct, now);
        offers.push({
          ...base,
          ...breakdown,
          listTotal: offer.total,
          etaMin: offer.etaMin,
          etaMax: offer.etaMax,
          deepLink: adapters[platform].storeUrl(base.platformRestaurantId),
          fetchedAt: new Date(offer.fetchedAt).toISOString(),
          promo: offer.promo
            ? { code: offer.promo.code, description: offer.promo.description, endsAt: new Date(offer.promo.endsAt).toISOString() }
            : null,
        });
      } catch (err) {
        unavailable.push({ ...base, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  offers.sort((a, b) => a.total - b.total);
  const best = offers[0] ?? null;
  const worst = offers.length > 1 ? offers[offers.length - 1] : null;
  const savings = best && worst ? Math.round((worst.total - best.total) * 100) / 100 : 0;
  return { offers, unavailable, best, worst, savings };
}
