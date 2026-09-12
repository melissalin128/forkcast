/**
 * Uber Eats parsers.
 *
 * ubereats.com is server-rendered with the React Query cache embedded as
 * `<script type="application/json" id="__REACT_QUERY_STATE__">` whose body is
 * JSON with `"`-escaped quotes (verified on the real home page 2026-09;
 * search/store pages were Cloudflare-blocked from the sandbox, so their shapes
 * below follow Uber's public web payloads and are parsed defensively):
 *
 *   state.queries[].state.data
 *     search / feed:  { feedItems: [ { type: "STORE", uuid, store: { storeUuid, title: {text},
 *                       rating: {text: "4.6", accessoryText: "(500+)"}, image: {items: [{url}]},
 *                       meta: [{text: "$0.49 Delivery Fee"}, {text: "20 min"}],
 *                       actionUrl: "/store/<slug>/<uuid>?...", categories? } } ], stores? }
 *     store page:     { uuid, title, location: {address, streetAddress, postalCode, city},
 *                       rating: {ratingValue, reviewCount}, categories: [..], heroImageUrls: [{url}],
 *                       etaRange: {text: "20–35 min"}, fareBadge: {text: "$0.99 Delivery Fee"},
 *                       fareInfo: {...}, promotion: {text}, catalogSectionsMap: { <sectionUuid>: [
 *                         { payload: { standardItemsPayload: { catalogItems: [
 *                           { uuid, title, price (cents), isAvailable, isSoldOut } ] } } } ] } }
 *
 * The same objects arrive as JSON from the page's own RPCs (/_p/api/getFeedV1,
 * getSearchFeedV1, getStoreV1), so every parser accepts either raw HTML or JSON.
 */
import {
  allScriptJson,
  extractScriptJson,
  findFeeLine,
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

export interface UberEatsListing {
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

export interface UberEatsItem {
  id: string;
  name: string;
  price: number;
  available?: boolean;
}

export interface UberEatsStore {
  id: string;
  name?: string;
  street?: string;
  zip?: string;
  city?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  deliveryFee?: number;
  serviceFee?: number;
  etaMin?: number;
  etaMax?: number;
  promoText?: string;
  items: UberEatsItem[];
}

/** HTML or JSON -> the React Query state (or the raw JSON when it already is a payload). */
export function uberEatsState(input: string): Json | undefined {
  const t = input.trim();
  if (t.startsWith('{') || t.startsWith('[')) return safeJson(t);
  const state = extractScriptJson(input, '__REACT_QUERY_STATE__');
  if (state !== undefined) return state;
  const scripts = allScriptJson(input);
  return scripts.length ? scripts : undefined;
}

/** Decode Uber's base64 `/store/<slug>/<id>` id form when the search feed gives a uuid instead. */
export const storePath = (url: string | undefined): string | undefined => url?.match(/\/store\/([^?#]+)/)?.[1]?.replace(/\/$/, '');

const textsIn = (o: Json | undefined, depth = 3): string[] => {
  const out: string[] = [];
  const walk = (v: Json | undefined, d: number) => {
    if (d < 0 || v === undefined || v === null) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, d - 1));
    else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, d - 1));
  };
  walk(o, depth);
  return out;
};

const feeFromTexts = (texts: string[]): number | undefined => {
  const t = texts.find((s) => /deliver/i.test(s) && (/\$\s*\d/.test(s) || /free/i.test(s)));
  return t ? parseMoney(t.match(/(\$\s*\d+(?:\.\d{1,2})?|free)/i)?.[1] ?? t) : undefined;
};

const etaFromTexts = (texts: string[]): [number, number] | undefined => {
  for (const s of texts) {
    const e = parseEta(s);
    if (e) return e;
  }
  return undefined;
};

const countFromText = (s: string | undefined): number | undefined => (s ? parseRating(`(${s.replace(/[()]/g, '')})`).ratingCount : undefined);

const isStoreCard = (o: JsonObject): boolean =>
  (typeof o.storeUuid === 'string' || (typeof o.uuid === 'string' && typeof o.actionUrl === 'string')) && richText(o.title) !== undefined;

/** Search or feed (HTML or JSON) -> store cards. */
export function parseUberEatsSearch(input: string): UberEatsListing[] {
  const root = uberEatsState(input);
  if (root === undefined) return [];
  const cards = findObjects(root, isStoreCard);
  const seen = new Set<string>();
  const out: UberEatsListing[] = [];
  for (const c of cards) {
    const name = richText(c.title);
    const url = str(c.actionUrl) ?? str(c.url) ?? str(c.link);
    const id = storePath(url) ?? str(c.storeUuid) ?? str(c.uuid);
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    const ratingText = richText(c.rating);
    const ratingCountText = isObject(c.rating) ? str(c.rating.accessoryText) : undefined;
    const meta = textsIn(c.meta ?? c.subtitle ?? c.tags, 3);
    const eta = etaFromTexts(meta);
    const img = str(get(c, 'image', 'items', 0, 'url')) ?? str(get(c, 'image', 'url')) ?? str(c.imageUrl) ?? str(get(c, 'heroImageUrls', 0, 'url'));
    const cats = Array.isArray(c.categories) ? c.categories.map((x) => richText(x) ?? '').filter(Boolean) : [];
    out.push({
      id,
      name,
      url: url ? new URL(url, 'https://www.ubereats.com').toString() : undefined,
      cuisines: cats.slice(0, 5),
      rating: ratingText ? num(ratingText.match(/[0-5](?:\.\d)?/)?.[0]) : undefined,
      ratingCount: countFromText(ratingCountText),
      imageUrl: img,
      deliveryFee: feeFromTexts(meta),
      etaMin: eta?.[0],
      etaMax: eta?.[1],
      street: str(get(c, 'location', 'streetAddress')) ?? str(get(c, 'location', 'address')),
      zip: str(get(c, 'location', 'postalCode')),
    });
  }
  return out;
}

const isStorePayload = (o: JsonObject): boolean =>
  typeof o.uuid === 'string' && (isObject(o.catalogSectionsMap) || Array.isArray(o.sections) || isObject(o.etaRange) || isObject(o.fareInfo)) && richText(o.title) !== undefined;

const isCatalogItem = (o: JsonObject): boolean => typeof o.uuid === 'string' && richText(o.title) !== undefined && (typeof o.price === 'number' || typeof o.priceTagline === 'object' || typeof o.priceTagline === 'string');

/** Store page (HTML or JSON) -> store facts + menu items. */
export function parseUberEatsStore(input: string): UberEatsStore | null {
  const root = uberEatsState(input);
  if (root === undefined) return null;
  const store = findObjects(root, isStorePayload, 1)[0];
  if (!store) return null;
  const loc = isObject(store.location) ? store.location : undefined;
  const rating = isObject(store.rating) ? store.rating : undefined;
  const texts = textsIn({ a: store.fareBadge ?? null, b: store.fareInfo ?? null, c: store.meta ?? null, d: store.etaRange ?? null, e: store.subtitle ?? null, f: store.storeBadges ?? null } as JsonObject, 4);
  const eta = etaFromTexts([richText(store.etaRange) ?? '', ...texts]);
  const items: UberEatsItem[] = [];
  const seen = new Set<string>();
  for (const it of findObjects(store.catalogSectionsMap ?? store.sections ?? store, isCatalogItem, 2000)) {
    const id = str(it.uuid)!;
    if (seen.has(id)) continue;
    seen.add(id);
    const cents = num(it.price);
    const price = cents !== undefined ? round2(cents / 100) : parseMoney(richText(it.priceTagline));
    if (price === undefined || price <= 0) continue;
    items.push({ id, name: richText(it.title)!, price, available: it.isAvailable === false || it.isSoldOut === true ? false : undefined });
  }
  const serviceFeeText = texts.find((s) => /service fee/i.test(s));
  return {
    id: str(store.uuid)!,
    name: richText(store.title),
    street: loc ? str(loc.streetAddress) ?? str(loc.address)?.split(',')[0] : undefined,
    zip: loc ? str(loc.postalCode) ?? str(loc.address)?.match(/\b\d{5}\b/)?.[0] : undefined,
    city: loc ? str(loc.city) : undefined,
    cuisines: Array.isArray(store.categories) ? store.categories.map((x) => richText(x) ?? '').filter(Boolean).slice(0, 5) : [],
    rating: num(rating?.ratingValue) ?? num(richText(rating)),
    // reviewCount arrives as 3100, "3100" or "3,100+"; accessoryText as "(500+)"
    ratingCount: num(rating?.reviewCount) ?? countFromText(str(rating?.reviewCount)) ?? countFromText(str(rating?.accessoryText)),
    imageUrl: str(get(store, 'heroImageUrls', 0, 'url')) ?? str(get(store, 'heroImageUrls', -1, 'url')),
    deliveryFee: feeFromTexts(texts),
    serviceFee: serviceFeeText ? parseMoney(serviceFeeText) : undefined,
    etaMin: eta?.[0],
    etaMax: eta?.[1],
    promoText: richText(store.promotion) ?? richText(get(store, 'promotions', 0)),
    items,
  };
}

export interface CheckoutLines {
  subtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  smallOrderFee?: number;
  tax?: number;
  total?: number;
}

/** Flattened checkout / cart drawer text -> fee lines. Works for Uber Eats and DoorDash copy. */
export function parseCheckoutText(text: string): CheckoutLines {
  const t = text.replace(/\s+/g, ' ');
  return {
    subtotal: findFeeLine(t, /subtotal/),
    deliveryFee: findFeeLine(t, /delivery fee/),
    serviceFee: findFeeLine(t, /service fee/),
    smallOrderFee: findFeeLine(t, /small order fee/),
    tax: findFeeLine(t, /(?:estimated tax|taxes?(?: & other fees| and other fees)?|fees & estimated tax)/),
    total: findFeeLine(t, /(?:^|\s)total(?!\s*savings)/),
  };
}

export function pickUberEatsSubtotal(items: UberEatsItem[], cart: Array<{ name: string; quantity: number }>): { subtotal: number; matched: UberEatsItem[]; representative?: UberEatsItem } {
  const priced = items.filter((i) => i.price > 0 && i.available !== false);
  const matched: UberEatsItem[] = [];
  let subtotal = 0;
  for (const line of cart) {
    const hit = priced.find((i) => nameMatches(i.name, line.name));
    if (hit) {
      matched.push(hit);
      subtotal += hit.price * Math.max(1, line.quantity);
    }
  }
  if (matched.length) return { subtotal: round2(subtotal), matched };
  const representative = [...priced].sort((a, b) => a.price - b.price)[Math.floor(priced.length / 2)];
  return { subtotal: representative ? representative.price : 0, matched, representative };
}

export function uberEatsPromo(store: UberEatsStore, now = new Date()): OfferPromo | undefined {
  return parsePromoText(store.promoText, undefined, now);
}
