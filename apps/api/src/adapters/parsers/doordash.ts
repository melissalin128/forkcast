/**
 * DoorDash parsers.
 *
 * doordash.com was Cloudflare-blocked from the sandbox this was written in, so
 * the shapes below follow DoorDash's public consumer web payloads and are
 * parsed defensively (every field optional, several candidate keys):
 *
 *   search page  POST /graphql/searchWithFilterFacetFeed?operation=searchWithFilterFacetFeed
 *     -> { data: { searchWithFilterFacetFeed: { body: [ { id, body: [ FacetV2 ] } ] } } }
 *        FacetV2 store row: { id: "row.store:1234567", text: { title: "Papa Johns",
 *          subtitle: "4.7★ (3,900+) • 0.6 mi • 24 min", accessory: "$0 delivery fee", ... },
 *          images: { main: { uri } }, logging: { store_id: 1234567, ... },
 *          events: { click: { data: { uri: "/store/1234567/" } } } }
 *
 *   store page   POST /graphql/storepageFeed?operation=storepageFeed
 *     -> { data: { storepageFeed: { storeHeader: { id, name, address: { street, city, postalCode },
 *          ratings: { averageRating, numRatings }, displayDeliveryFee: "$0.00 delivery fee",
 *          deliveryTimeLayout: { title: "25 min" }, businessHeaderImgUrl, priceRange, promotions? },
 *          itemLists: [ { items: [ { id, name, displayPrice: "$12.99", price?: 1299 } ] } ] } } }
 *
 *   SSR fallbacks: `<script id="__NEXT_DATA__">`, `window.__APOLLO_STATE__ = {...}` and
 *   `window.__PRELOADED_STATE__` are all scanned with the same object predicates.
 */
import {
  allScriptJson,
  extractAssignedJson,
  extractScriptJson,
  findObjects,
  get,
  isObject,
  nameMatches,
  num,
  parseEta,
  parseMoney,
  parsePromoText,
  parseRating,
  richText,
  round2,
  safeJson,
  str,
  type Json,
  type JsonObject,
} from './common';
import type { OfferPromo } from '../../models/types';
import { parseCheckoutText, type CheckoutLines } from './ubereats';

export { parseCheckoutText };
export type { CheckoutLines };

export interface DoorDashListing {
  id: string;
  name: string;
  url?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  deliveryFee?: number;
  etaMin?: number;
  etaMax?: number;
  street?: string;
  zip?: string;
}

export interface DoorDashItem {
  id: string;
  name: string;
  price: number;
}

export interface DoorDashStore {
  id: string;
  name?: string;
  street?: string;
  city?: string;
  zip?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  deliveryFee?: number;
  etaMin?: number;
  etaMax?: number;
  promoText?: string;
  items: DoorDashItem[];
}

/** HTML or JSON -> one or more JSON roots to search. */
export function doorDashState(input: string): Json[] {
  const t = input.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = safeJson(t);
    return j === undefined ? [] : [j];
  }
  const roots: Json[] = [];
  for (const id of ['__NEXT_DATA__', '__APOLLO_STATE__', '__PRELOADED_STATE__', '__INITIAL_STATE__']) {
    const s = extractScriptJson(input, id) ?? extractAssignedJson(input, id);
    if (s !== undefined) roots.push(s);
  }
  if (roots.length === 0) roots.push(...allScriptJson(input));
  return roots;
}

const storeIdFrom = (o: JsonObject): string | undefined => {
  const direct = num(get(o, 'logging', 'store_id')) ?? num(o.storeId) ?? num(o.store_id);
  if (direct !== undefined) return String(direct);
  const id = str(o.id) ?? str(get(o, 'events', 'click', 'data', 'uri')) ?? str(o.href) ?? str(o.url);
  return id?.match(/store[:/](\d+)/)?.[1];
};

const isStoreRow = (o: JsonObject): boolean => {
  const id = storeIdFrom(o);
  if (!id) return false;
  const title = richText(get(o, 'text', 'title')) ?? str(o.name) ?? richText(o.title);
  // "row.item:99", "carousel.category:3" etc. carry a store_id in their logging but are not stores
  return title !== undefined && !/\b(item|category|cuisine|filter|carousel|banner)\b/i.test(str(o.id) ?? '');
};

const textsOf = (o: JsonObject): string[] => {
  const text = isObject(o.text) ? Object.values(o.text).map((v) => richText(v) ?? '') : [];
  return [...text, str(o.subtitle) ?? '', str(o.description) ?? '', str(o.displayDeliveryFee) ?? '', richText(o.deliveryTimeLayout) ?? '', str(get(o, 'deliveryTimeLayout', 'subtitle')) ?? ''].filter(Boolean);
};

const feeFrom = (texts: string[]): number | undefined => {
  const t = texts.find((s) => /deliver/i.test(s) && (/\$\s*\d/.test(s) || /free/i.test(s)));
  return t ? parseMoney(t.match(/(\$\s*\d+(?:\.\d{1,2})?|free)/i)?.[1] ?? t) : undefined;
};

/** Search results (GraphQL JSON or HTML) -> store rows. */
export function parseDoorDashSearch(input: string): DoorDashListing[] {
  const out: DoorDashListing[] = [];
  const seen = new Set<string>();
  for (const root of doorDashState(input)) {
    for (const o of findObjects(root, isStoreRow)) {
      const id = storeIdFrom(o)!;
      if (seen.has(id)) continue;
      const name = richText(get(o, 'text', 'title')) ?? str(o.name) ?? richText(o.title)!;
      seen.add(id);
      const texts = textsOf(o);
      const meta = texts.join(' • ');
      const eta = parseEta(meta);
      const ratingObj = isObject(o.ratings) ? o.ratings : undefined;
      out.push({
        id,
        name,
        url: `https://www.doordash.com/store/${id}/`,
        cuisines: cuisinesFrom(o),
        rating: num(ratingObj?.averageRating) ?? num(o.averageRating) ?? parseRating(meta).rating,
        ratingCount: num(ratingObj?.numRatings) ?? num(o.numRatings) ?? parseRating(meta).ratingCount,
        imageUrl: str(get(o, 'images', 'main', 'uri')) ?? str(o.imageUrl) ?? str(o.headerImgUrl) ?? str(o.coverImgUrl),
        deliveryFee: feeFrom(texts),
        etaMin: eta?.[0],
        etaMax: eta?.[1],
        street: str(get(o, 'address', 'street')),
        zip: str(get(o, 'address', 'postalCode')) ?? str(get(o, 'address', 'zipCode')),
      });
    }
  }
  return out;
}

function cuisinesFrom(o: JsonObject): string[] {
  const c = o.cuisine ?? o.cuisines ?? get(o, 'custom', 'cuisine') ?? get(o, 'text', 'subtitle');
  if (Array.isArray(c)) return c.map((x) => richText(x) ?? '').filter(Boolean).slice(0, 5);
  const s = richText(c);
  if (!s) return [];
  // "4.7★ (3,900+) • Pizza • 0.6 mi" -> the tokens that are neither ratings, distances nor times
  return s
    .split(/•|·|,/)
    .map((x) => x.trim())
    .filter((x) => x && !/\d/.test(x) && !/^(mi|min|delivery)/i.test(x))
    .slice(0, 4);
}

const isStoreHeader = (o: JsonObject): boolean =>
  (str(o.name) !== undefined || richText(o.title) !== undefined) &&
  (typeof o.displayDeliveryFee === 'string' || isObject(o.deliveryTimeLayout) || (isObject(o.ratings) && isObject(o.address)));

const isMenuItem = (o: JsonObject): boolean => (str(o.name) !== undefined || richText(o.title) !== undefined) && (typeof o.displayPrice === 'string' || typeof o.price === 'number');

/** Store page (GraphQL JSON or HTML) -> header facts + menu items. */
export function parseDoorDashStore(input: string): DoorDashStore | null {
  const roots = doorDashState(input);
  let header: JsonObject | undefined;
  const items: DoorDashItem[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    header ??= (get(root, 'data', 'storepageFeed', 'storeHeader') as JsonObject | undefined) ?? findObjects(root, isStoreHeader, 1)[0];
    for (const it of findObjects(root, isMenuItem, 3000)) {
      const id = str(it.id) ?? str(it.uuid) ?? String(num(it.id) ?? '');
      const name = str(it.name) ?? richText(it.title)!;
      if (!id || seen.has(id)) continue;
      const price = typeof it.displayPrice === 'string' ? parseMoney(it.displayPrice) : num(it.price) !== undefined ? round2(num(it.price)! / 100) : undefined;
      if (price === undefined || price <= 0) continue;
      seen.add(id);
      items.push({ id, name, price });
    }
  }
  if (!header && items.length === 0) return null;
  const h = header ?? {};
  const texts = textsOf(h);
  const eta = parseEta(texts.join(' • '));
  const ratings = isObject(h.ratings) ? h.ratings : undefined;
  const addr = isObject(h.address) ? h.address : undefined;
  const id = storeIdFrom(h) ?? str(h.id) ?? '';
  return {
    id,
    name: str(h.name) ?? richText(h.title),
    street: addr ? str(addr.street) ?? str(addr.printableAddress)?.split(',')[0] : undefined,
    city: addr ? str(addr.city) : undefined,
    zip: addr ? str(addr.postalCode) ?? str(addr.zipCode) : undefined,
    cuisines: cuisinesFrom(h),
    rating: num(ratings?.averageRating) ?? num(h.averageRating),
    ratingCount: num(ratings?.numRatings) ?? num(h.numRatings),
    imageUrl: str(h.businessHeaderImgUrl) ?? str(h.headerImgUrl) ?? str(h.coverImgUrl) ?? str(get(h, 'images', 'main', 'uri')),
    deliveryFee: feeFrom(texts),
    etaMin: eta?.[0],
    etaMax: eta?.[1],
    promoText: richText(get(h, 'promotions', 0)) ?? richText(h.promotion) ?? str(get(h, 'promotions', 0, 'title')),
    items,
  };
}

export function pickDoorDashSubtotal(items: DoorDashItem[], cart: Array<{ name: string; quantity: number }>): { subtotal: number; matched: DoorDashItem[]; representative?: DoorDashItem } {
  const matched: DoorDashItem[] = [];
  let subtotal = 0;
  for (const line of cart) {
    const hit = items.find((i) => nameMatches(i.name, line.name));
    if (hit) {
      matched.push(hit);
      subtotal += hit.price * Math.max(1, line.quantity);
    }
  }
  if (matched.length) return { subtotal: round2(subtotal), matched };
  const representative = [...items].sort((a, b) => a.price - b.price)[Math.floor(items.length / 2)];
  return { subtotal: representative ? representative.price : 0, matched, representative };
}

export function doorDashPromo(store: DoorDashStore, now = new Date()): OfferPromo | undefined {
  return parsePromoText(store.promoText, undefined, now);
}
