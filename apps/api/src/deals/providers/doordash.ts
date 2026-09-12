/**
 * DoorDash deals via the Apify actor `dz_omar/doordash-scraper`.
 *
 * Input: DoorDash search URLs (one per query) plus a full street address —
 * DoorDash prices and lists stores against that address, and a bare city or zip
 * does not resolve reliably. `maxResults` is per URL, so the feed splits the
 * run's cap across its queries.
 *
 * Deal signal in the output, in descending order of confidence:
 *   - `delivery_fee_display`  "$0.00 delivery fee" -> a free-delivery deal.
 *     A non-zero fee is just a fee, not a deal, so nothing is emitted for it.
 *   - `tags[].name`           store-level badges, some of which are offers.
 *   - menu item `badges[].text` and a struck-through price in `price_display`.
 *
 * Everything that does not classify as an actual deal is dropped rather than
 * stored as `other`, so the feed stays deals-only.
 */
import { haversineMiles } from '../../services/geo';
import type { DealType, NewDeal } from '../../models/types';
import { classifyDeal, parseMoney } from './common';
import type { DealProvider, JobSpec, NormalizeContext, NormalizeFailure, NormalizeResult } from './types';

const STORE_URL_BASE = 'https://www.doordash.com';

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

  // 1. delivery fee. Only $0 is a deal; an ordinary fee is not.
  const feeText = str(store.delivery_fee_display);
  if (feeText) {
    const fee = parseMoney(feeText);
    if (fee === 0 || /free/i.test(feeText)) {
      add(feeText, classifyDeal(feeText, { deliveryFee: 0 }), { delivery_fee_display: feeText, is_dashpass: store.is_dashpass });
    }
  }

  // 2. store-level tags that read as an offer
  for (const tag of arr(store.tags)) {
    const name = str((tag as { name?: unknown })?.name);
    if (name) add(name, classifyDeal(name), tag);
  }

  // 3. menu item badges and struck-through prices
  for (const category of arr(store.menu_categories)) {
    for (const item of arr((category as { items?: unknown })?.items)) {
      const menuItem = item as DoorDashMenuItem;
      const itemName = str(menuItem?.name);
      const prices = itemPrices(menuItem);
      if (prices && itemName) {
        add(`${itemName}: ${str(menuItem.price_display)}`, classifyDeal(itemName, prices), menuItem);
      }
      for (const badge of arr(menuItem?.badges)) {
        const text = str((badge as { text?: unknown })?.text);
        if (!text) continue;
        const headline = itemName ? `${text} on ${itemName}` : text;
        const parsed = classifyDeal(text);
        if (parsed.dealType !== 'other') add(headline, parsed, { item: itemName, badge });
      }
    }
  }

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
}

interface DoorDashMenuItem {
  name?: unknown;
  price_display?: unknown;
  badges?: unknown;
}

export const doorDashDealProvider = new DoorDashDealProvider();
