/**
 * DoorDash deals via the Apify actor `dz_omar/doordash-scraper`.
 *
 * Input: DoorDash search URLs (one per query) plus a full street address —
 * DoorDash prices and lists stores against that address, and a bare city or zip
 * does not resolve reliably. `maxResults` is per URL, so the feed splits the
 * run's cap across its queries.
 *
 * Where the deal signal actually is, confirmed against a real run (see
 * __fixtures__/README.md):
 *
 *   - menu and featured item `badges[]`. This is the real source. DoorDash
 *     gives each badge a semantic `type` (`bogo_offer`,
 *     `lunch_special_percent_off`, `affordable_meal_zero_delivery_fee_item`,
 *     `fios_offer`) alongside display text like "Buy 1, get 1 free" or
 *     "25% off". Popularity badges ("#1 Most liked") share the same array and
 *     are not offers, so they are filtered out by type.
 *   - `delivery_fee_display`, but only when it is a real store fee. Logged out,
 *     DoorDash shows "$0 delivery fee, first order" on nearly every store: that
 *     is a signup promo for the viewer, not a deal at this restaurant, and
 *     emitting it would mark the whole feed free-delivery and tell the user
 *     nothing. Those are skipped; a genuine "$0 delivery fee" is kept.
 *   - `tags[].name`. In practice these are cuisine labels, not offers, but any
 *     that do read as an offer are picked up.
 *   - a struck-through price in `price_display`. Not present in the run we
 *     captured, kept because it costs nothing and the field is documented.
 *
 * Anything that does not classify as an actual deal is dropped rather than
 * stored as `other`, so the feed stays deals-only.
 */
import { haversineMiles } from '../../services/geo';
import type { DealType, NewDeal } from '../../models/types';
import { classifyDeal, parseMoney } from './common';
import type { DealProvider, JobSpec, NormalizeContext, NormalizeFailure, NormalizeResult } from './types';

const STORE_URL_BASE = 'https://www.doordash.com';

/** Badge types that rank an item rather than discount it. */
const NON_OFFER_BADGE_TYPES = /^most_liked/i;

/**
 * A delivery fee that is conditional on who is ordering rather than on the
 * restaurant: "$0 delivery fee, first order". Same text on nearly every store,
 * so it carries no information and must not become a deal.
 */
const VIEWER_CONDITIONAL_FEE = /\b(first order|new customer|with dashpass|dashpass exclusive)\b/i;

/** Deal types worth storing. `other` means we could not read a deal out of the text. */
const KEPT_TYPES: readonly DealType[] = [
  'free_delivery',
  'reduced_delivery_fee',
  'percent_off',
  'dollar_off',
  'bogo',
  'item_discount',
  'promo_code',
];

export function searchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query.trim()));
}

export class DoorDashDealProvider implements DealProvider {
  readonly platform = 'doordash' as const;

  buildInput(job: JobSpec): Record<string, unknown> {
    const queries = job.kind === 'feed' ? job.queries : [job.query];
    const urls = queries.filter((q) => q.trim()).map((q) => ({ url: searchUrl(job.actor.searchUrlTemplate, q) }));
    if (urls.length === 0) throw new Error('[doordash] no search queries to run');
    // maxResults is per URL and the run total is maxResults x urls, so divide the cap across the queries.
    const perUrl = Math.max(1, Math.floor(job.maxResults / urls.length));
    return {
      ...job.actor.input,
      startUrls: urls,
      address: job.address.streetAddress,
      maxResults: perUrl,
      fetchReviews: false,
    };
  }

  normalize(items: unknown[], ctx: NormalizeContext): NormalizeResult {
    const deals: NewDeal[] = [];
    const failures: NormalizeFailure[] = [];
    let storesWithoutDeals = 0;

    items.forEach((item, index) => {
      try {
        const store = item as DoorDashStore;
        if (store?.record_type === 'review') return; // reviews are off, but never trip over one
        const platformRestaurantId = str(store?.store_id);
        const restaurantName = str(store?.name);
        if (!platformRestaurantId || !restaurantName) {
          failures.push({ index, reason: 'missing store_id or name', platformRestaurantId });
          return;
        }
        const found = storeDeals(store, platformRestaurantId, restaurantName, ctx);
        if (found.length === 0) storesWithoutDeals += 1;
        deals.push(...found);
      } catch (err) {
        failures.push({ index, reason: err instanceof Error ? err.message : String(err) });
      }
    });

    return { deals, failures, storesWithoutDeals };
  }
}

function storeDeals(store: DoorDashStore, platformRestaurantId: string, restaurantName: string, ctx: NormalizeContext): NewDeal[] {
  const geo = coords(store);
  const base = {
    platform: 'doordash' as const,
    restaurantName,
    platformRestaurantId,
    cuisine: cuisines(store),
    ...(geo ? { geo } : {}),
    ...(geo ? { distanceMi: round1(haversineMiles({ lat: ctx.address.lat, lng: ctx.address.lng }, geo)) } : {}),
    addressKey: ctx.address.key,
    deepLink: storeUrl(store),
  };

  const out: NewDeal[] = [];
  const seen = new Set<string>();
  const add = (headline: string, parsed: ReturnType<typeof classifyDeal>, raw: unknown): void => {
    const text = headline.trim();
    if (!text || !KEPT_TYPES.includes(parsed.dealType)) return;
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ ...base, headline: text, ...parsed, raw });
  };

  // 1. delivery fee, but only when it is the store's own and not the viewer's signup promo
  const feeText = str(store.delivery_fee_display);
  if (feeText && !VIEWER_CONDITIONAL_FEE.test(feeText)) {
    const fee = parseMoney(feeText);
    if (fee === 0 || /free/i.test(feeText)) {
      add(feeText, classifyDeal(feeText, { deliveryFee: 0 }), { delivery_fee_display: feeText, is_dashpass: store.is_dashpass });
    }
  }

  // 2. store-level tags that read as an offer (usually cuisine labels, which classify as "other" and are dropped)
  for (const tag of arr(store.tags)) {
    const name = str((tag as { name?: unknown })?.name);
    if (name) add(name, classifyDeal(name), tag);
  }

  // 3. item badges: the real source. One deal per distinct badge text per store,
  //    with the items carrying it recorded so the raw payload still shows what is discounted.
  const byText = new Map<string, { badge: unknown; items: string[] }>();
  for (const item of menuItems(store)) {
    const itemName = str(item?.name);
    const prices = itemPrices(item);
    if (prices && itemName) add(`${itemName}: ${str(item.price_display)}`, classifyDeal(itemName, prices), item);
    for (const badge of arr(item?.badges)) {
      const b = badge as { text?: unknown; type?: unknown };
      const text = str(b?.text);
      const type = str(b?.type);
      if (!text || (type && NON_OFFER_BADGE_TYPES.test(type))) continue;
      const entry = byText.get(text) ?? { badge, items: [] };
      if (itemName && !entry.items.includes(itemName)) entry.items.push(itemName);
      byText.set(text, entry);
    }
  }
  for (const [text, entry] of byText) {
    add(text, classifyDeal(text), { badge: entry.badge, items: entry.items.slice(0, 10), itemCount: entry.items.length });
  }

  return out;
}

/** Every item on the store record: menu categories plus the featured carousel. */
function menuItems(store: DoorDashStore): DoorDashMenuItem[] {
  const out: DoorDashMenuItem[] = [];
  for (const category of arr(store.menu_categories)) {
    for (const item of arr((category as { items?: unknown })?.items)) out.push(item as DoorDashMenuItem);
  }
  for (const item of arr((store.featured_items as { items?: unknown } | undefined)?.items)) out.push(item as DoorDashMenuItem);
  return out;
}

/**
 * A struck-through price shows up as `price_display` carrying two amounts
 * ("$18.00 $12.00") while `price_cents` holds the one actually charged.
 */
function itemPrices(item: DoorDashMenuItem | undefined): { originalPrice: number; salePrice: number } | undefined {
  const display = str(item?.price_display);
  if (!display) return undefined;
  const amounts = [...display.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  if (amounts.length < 2) return undefined;
  const originalPrice = Math.max(...amounts);
  const salePrice = Math.min(...amounts);
  return salePrice < originalPrice ? { originalPrice, salePrice } : undefined;
}

function storeUrl(store: DoorDashStore): string | undefined {
  const url = str(store.url);
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${STORE_URL_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function cuisines(store: DoorDashStore): string[] {
  const names = arr(store.tags)
    .map((t) => str((t as { name?: unknown })?.name))
    .filter((n): n is string => !!n);
  // tags mix cuisine labels with offer text; the offer text is picked up as a deal, not as a cuisine
  return [...new Set(names.filter((n) => classifyDeal(n).dealType === 'other' && n.length <= 30))];
}

function coords(store: DoorDashStore): { lat: number; lng: number } | undefined {
  const lat = num(store.lat);
  const lng = num(store.lng);
  return lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Only the fields we read; the actor returns many more and they land in `raw`. */
interface DoorDashStore {
  record_type?: unknown;
  store_id?: unknown;
  name?: unknown;
  url?: unknown;
  lat?: unknown;
  lng?: unknown;
  delivery_fee_display?: unknown;
  is_dashpass?: unknown;
  tags?: unknown;
  menu_categories?: unknown;
  featured_items?: unknown;
}

interface DoorDashMenuItem {
  name?: unknown;
  price_display?: unknown;
  badges?: unknown;
}

export const doorDashDealProvider = new DoorDashDealProvider();
