/**
 * One scrape job = "for this zip and search term, what does the same restaurant
 * cost on each platform right now?"
 *
 *   searchRestaurants on every requested platform (in parallel, one browser each)
 *   -> RestaurantMatcher joins the listings into physical restaurants
 *   -> repo.upsertRestaurant for each
 *   -> fetchOffer per (restaurant, platform) -> repo.saveOffer + repo.appendSnapshot
 *   -> rows: restaurant | total per platform | cheapest
 *
 * Used by `npm run scrape` (src/scrape.ts) and `POST /api/scrape` (routes/scrape.ts).
 */
import { MockAdapter } from '../adapters/mock';
import { BlockedError } from '../adapters/scraperBase';
import type { PlatformAdapter, PlatformListing } from '../adapters/types';
import { matchRestaurants, streetNumber, type MatchedRestaurant } from '../matcher/restaurantMatcher';
import { PLATFORM_SLUGS, type Offer, type PlatformSlug, type Restaurant } from '../models/types';
import type { Repository } from '../repo';
import { slugify } from '../seed/data';
import { geocodeZip } from './zipGeo';

export interface ScrapeJobOptions {
  zip: string;
  q: string;
  platforms?: PlatformSlug[];
  /** Max listings taken from each platform's search before matching. */
  limit?: number;
  repo: Repository;
  adapters: Record<PlatformSlug, PlatformAdapter>;
  /** When a live platform fails, price it with the mock adapter instead (CLI --allow-mock). */
  allowMock?: boolean;
  log?: (line: string) => void;
  now?: Date;
}

export interface ScrapeOfferCell {
  total: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  smallOrderFee: number;
  tax: number;
  etaMin: number;
  etaMax: number;
  deepLink: string;
  promoCode?: string;
  locationUnverified?: boolean;
  representativeItem?: { name: string; price: number };
  /** true when this cell came from the mock adapter (--allow-mock). */
  mock?: boolean;
}

export interface ScrapeRow {
  restaurantId: string;
  slug: string;
  name: string;
  address: string;
  platformIds: Partial<Record<PlatformSlug, string>>;
  offers: Partial<Record<PlatformSlug, ScrapeOfferCell>>;
  errors: Partial<Record<PlatformSlug, string>>;
  cheapest: PlatformSlug | null;
  /** Most expensive minus cheapest, when at least two platforms priced it. */
  savings: number;
}

export interface PlatformSummary {
  ok: boolean;
  listings: number;
  offers: number;
  error?: string;
  blocked?: boolean;
  mock?: boolean;
}

export interface ScrapeResult {
  zip: string;
  q: string;
  startedAt: string;
  finishedAt: string;
  platforms: Partial<Record<PlatformSlug, PlatformSummary>>;
  rows: ScrapeRow[];
  /** true when every requested platform failed to search. */
  allFailed: boolean;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function runScrapeJob(opts: ScrapeJobOptions): Promise<ScrapeResult> {
  const platforms = opts.platforms?.length ? opts.platforms : PLATFORM_SLUGS;
  const limit = Math.max(1, opts.limit ?? 10);
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const startedAt = new Date();
  const summaries: Partial<Record<PlatformSlug, PlatformSummary>> = {};
  const active: Partial<Record<PlatformSlug, PlatformAdapter>> = {};

  // 1. search every platform in parallel
  const listings: PlatformListing[] = [];
  await Promise.all(
    platforms.map(async (p) => {
      let adapter = opts.adapters[p];
      try {
        const found = (await adapter.searchRestaurants(opts.zip, opts.q)).slice(0, limit);
        summaries[p] = { ok: true, listings: found.length, offers: 0 };
        active[p] = adapter;
        listings.push(...found);
        log(`[${p}] ${found.length} listings for "${opts.q}" near ${opts.zip}`);
      } catch (err) {
        const blocked = err instanceof BlockedError;
        summaries[p] = { ok: false, listings: 0, offers: 0, error: errText(err), blocked };
        log(`[${p}] search failed: ${errText(err)}`);
        if (opts.allowMock) {
          adapter = new MockAdapter(p);
          const found = (await adapter.searchRestaurants(opts.zip, opts.q)).slice(0, limit);
          summaries[p] = { ...summaries[p]!, mock: true, listings: found.length };
          active[p] = adapter;
          listings.push(...found);
          log(`[${p}] --allow-mock: using ${found.length} mock listings instead`);
        }
      }
    }),
  );

  // 2. join the same restaurant across platforms
  const groups = matchRestaurants(listings).sort((a, b) => Object.keys(b.platformIds).length - Object.keys(a.platformIds).length);
  const rows: ScrapeRow[] = [];
  const restaurants = new Map<string, Restaurant>();
  const geo = await geocodeZip(opts.zip);

  for (const g of groups) {
    const r = await opts.repo.upsertRestaurant(toRestaurant(g, opts.zip, geo, opts.q));
    restaurants.set(g.key, r);
    rows.push({ restaurantId: r.id, slug: r.slug, name: r.name, address: r.address, platformIds: r.platformIds, offers: {}, errors: {}, cheapest: null, savings: 0 });
  }

  // 3. price each restaurant on each platform: platforms in parallel, stores sequentially per platform
  await Promise.all(
    (Object.keys(active) as PlatformSlug[]).map(async (p) => {
      const adapter = active[p]!;
      const mock = summaries[p]?.mock === true;
      for (let i = 0; i < groups.length; i += 1) {
        const g = groups[i];
        const storeId = g.platformIds[p];
        if (!storeId) continue;
        const r = restaurants.get(g.key)!;
        const row = rows[i];
        const cart = r.sampleItem.menuPrice > 0 ? [{ name: r.sampleItem.name, quantity: 1, unitPrice: r.sampleItem.menuPrice }] : [{ name: opts.q, quantity: 1 }];
        try {
          const fetched = await adapter.fetchOffer(storeId, opts.zip, cart, { at: now });
          const offer: Offer = { ...fetched, restaurantId: r.id, platformRestaurantId: storeId };
          const saved = await opts.repo.saveOffer(offer);
          await opts.repo.appendSnapshot({ restaurantId: r.id, platformSlug: p, total: saved.total, deliveryFee: saved.deliveryFee, etaMin: saved.etaMin, promoApplied: !!saved.promo, capturedAt: new Date(saved.fetchedAt) });
          if (r.sampleItem.menuPrice <= 0 && saved.representativeItem) {
            const updated = await opts.repo.upsertRestaurant({ ...stripId(r), sampleItem: { name: saved.representativeItem.name, menuPrice: saved.representativeItem.price } });
            restaurants.set(g.key, updated);
          }
          row.offers[p] = {
            total: saved.total,
            subtotal: saved.subtotal,
            deliveryFee: saved.deliveryFee,
            serviceFee: saved.serviceFee,
            smallOrderFee: saved.smallOrderFee,
            tax: saved.tax,
            etaMin: saved.etaMin,
            etaMax: saved.etaMax,
            deepLink: saved.deepLink ?? adapter.storeUrl(storeId),
            ...(saved.promo ? { promoCode: saved.promo.code } : {}),
            ...(saved.locationUnverified ? { locationUnverified: true } : {}),
            ...(saved.representativeItem ? { representativeItem: saved.representativeItem } : {}),
            ...(mock ? { mock: true } : {}),
          };
          summaries[p]!.offers += 1;
          log(`[${p}] ${r.name}: $${saved.total.toFixed(2)} (subtotal $${saved.subtotal.toFixed(2)}, delivery $${saved.deliveryFee.toFixed(2)}, eta ${saved.etaMin}-${saved.etaMax} min)`);
        } catch (err) {
          row.errors[p] = errText(err);
          log(`[${p}] ${r.name}: ${errText(err)}`);
          if (err instanceof BlockedError) {
            summaries[p] = { ...summaries[p]!, blocked: true, error: err.message };
            break; // no point hammering a platform that just blocked us
          }
        }
      }
    }),
  );

  for (const row of rows) {
    const priced = (Object.entries(row.offers) as Array<[PlatformSlug, ScrapeOfferCell]>).sort((a, b) => a[1].total - b[1].total);
    row.cheapest = priced[0]?.[0] ?? null;
    row.savings = priced.length > 1 ? Math.round((priced[priced.length - 1][1].total - priced[0][1].total) * 100) / 100 : 0;
  }
  rows.sort((a, b) => Object.keys(b.offers).length - Object.keys(a.offers).length || a.name.localeCompare(b.name));

  const allFailed = platforms.every((p) => summaries[p]?.ok === false && !summaries[p]?.mock);
  return { zip: opts.zip, q: opts.q, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), platforms: summaries, rows, allFailed };
}

const stripId = (r: Restaurant): Omit<Restaurant, 'id'> => {
  const { id: _ignored, ...rest } = r;
  return rest;
};

/** A matched group -> the Restaurant we persist (merged across its listings). */
export function toRestaurant(g: MatchedRestaurant, zip: string, geo: { lat: number; lng: number } | null, q: string): Omit<Restaurant, 'id'> {
  const best = [...g.listings].sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0));
  const cuisine = [...new Set(g.listings.flatMap((l) => l.cuisine))].slice(0, 6);
  const rated = g.listings.filter((l) => typeof l.rating === 'number');
  const rating = rated.length ? Math.round((rated.reduce((s, l) => s + (l.rating as number), 0) / rated.length) * 10) / 10 : 0;
  const num = streetNumber(g.address);
  const slug = `${slugify(g.name)}${num ? `-${num}` : ''}`;
  return {
    slug,
    name: g.name,
    address: g.address,
    cuisine: cuisine.length ? cuisine : [q],
    dietaryTags: [],
    rating,
    ratingCount: Math.max(0, ...g.listings.map((l) => l.ratingCount ?? 0)),
    priceTier: 2,
    location: { zip: best.find((l) => l.zip)?.zip ?? zip, geo: geo ?? { lat: 0, lng: 0 } },
    platformIds: g.platformIds,
    sampleItem: { name: q, menuPrice: 0 },
    imageUrl: best.find((l) => l.imageUrl)?.imageUrl,
  };
}

/** Plain-text table for the CLI. */
export function formatTable(result: ScrapeResult): string {
  const cols: Array<[string, (r: ScrapeRow) => string]> = [
    ['restaurant', (r) => r.name.slice(0, 34)],
    ['DoorDash', (r) => cell(r, 'doordash')],
    ['Uber Eats', (r) => cell(r, 'ubereats')],
    ['Grubhub', (r) => cell(r, 'grubhub')],
    ['cheapest', (r) => (r.cheapest ? `${label(r.cheapest)}${r.savings ? ` (save $${r.savings.toFixed(2)})` : ''}` : '-')],
  ];
  const widths = cols.map(([h, f]) => Math.max(h.length, ...result.rows.map((r) => f(r).length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const out = [line(cols.map(([h]) => h)), widths.map((w) => '-'.repeat(w)).join('-+-')];
  for (const r of result.rows) out.push(line(cols.map(([, f]) => f(r))));
  if (result.rows.length === 0) out.push('(no restaurants)');
  return out.join('\n');
}

const label = (p: PlatformSlug): string => ({ doordash: 'DoorDash', ubereats: 'Uber Eats', grubhub: 'Grubhub' })[p];

function cell(r: ScrapeRow, p: PlatformSlug): string {
  const o = r.offers[p];
  if (o) return `$${o.total.toFixed(2)}${o.mock ? ' (mock)' : ''}${o.locationUnverified ? '?' : ''}`;
  if (r.errors[p]) return 'error';
  return r.platformIds[p] ? '…' : '-';
}
