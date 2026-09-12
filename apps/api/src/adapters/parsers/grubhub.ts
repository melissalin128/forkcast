/**
 * Grubhub parsers. grubhub.com is a client-rendered SPA; every number comes
 * from api-gtm.grubhub.com JSON that the page fetches (verified live 2026-09):
 *
 *   GET /restaurants/search/search_listing?queryText=..&location=POINT(lng lat)&pageSize=36..
 *       -> { stats, pager, results: [ { restaurant_id, name, cuisines[], ratings{rating_count,
 *            rating_bayesian10_point}, logo, address{street_address,postal_code}, delivery_fee{price},
 *            delivery_time_estimate_lower_bound/upper_bound, distance_from_location, open,
 *            merchant_url_path, menu_items[{id,name,price(cents),popular}] } ] }
 *       (the older /restaurants/search endpoint wraps the same rows in `search_result`)
 *
 *   GET /restaurants/{id}?hideChoiceCategories=true&version=4&...&location=POINT(..)
 *       -> { restaurant_availability: { delivery_fee{amount}, sales_tax(percent),
 *              delivery_estimate_range_v2{minimum,maximum}, order_minimum{amount},
 *              delivery_offered_to_diner_location, open, open_delivery },
 *            restaurant: { name, address, cuisines, rating{rating_count,rating_value},
 *              rating_bayesian10_point, logo, order_type_settings: {
 *                service_fee.delivery_fee{fee_type:"PERCENT",percent_value,maximum_amount_for_percent{amount}},
 *                small_order_fee{minimum_order_value_cents, fee{flat_cents_value{amount}}},
 *                delivery_estimate_minutes },
 *              available_promo_codes[], available_offers[], restaurant_coupons[] } }
 *
 *   GET /restaurants/{id}/menu_items/?menuItemIds=..
 *       -> { menu_items: [ { id, name, price{amount}, delivery_price{amount},
 *              minimum_price_variation{amount}, tax_rate{rate}, popular, available, menu_category_name } ] }
 */
import {
  centsToDollars,
  findObjects,
  get,
  isObject,
  nameMatches,
  num,
  parsePromoText,
  round2,
  safeJson,
  str,
  type Json,
  type JsonObject,
} from './common';
import type { OfferPromo } from '../../models/types';

export interface GrubhubMenuItem {
  id: string;
  name: string;
  price: number;
  popular?: boolean;
  available?: boolean;
  category?: string;
  /** Item-level tax rate (fraction) when Grubhub sends one; usually 0 because tax is computed at checkout. */
  taxRate?: number;
}

export interface GrubhubSearchRow {
  id: string;
  name: string;
  urlPath?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  street?: string;
  city?: string;
  zip?: string;
  deliveryFee?: number;
  etaMin?: number;
  etaMax?: number;
  distanceMi?: number;
  open?: boolean;
  priceTier?: number;
  menuItems: GrubhubMenuItem[];
}

export interface GrubhubStore {
  id: string;
  name?: string;
  street?: string;
  city?: string;
  zip?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  priceTier?: number;
  /** Delivery fee for the diner's location, dollars. */
  deliveryFee?: number;
  deliveryFeeWithoutDiscounts?: number;
  /** Sales tax percent as Grubhub reports it for this restaurant (7 = 7%). */
  salesTaxPct?: number;
  etaMin?: number;
  etaMax?: number;
  orderMinimum?: number;
  serviceFeePct?: number;
  serviceFeeMax?: number;
  serviceFeeFlat?: number;
  smallOrderFee?: number;
  /** Small-order fee applies when the subtotal is below this (dollars). */
  smallOrderBelow?: number;
  open?: boolean;
  deliversHere?: boolean;
  promoCodes: string[];
  offers: string[];
}

const ratingOf = (o: JsonObject | undefined): { rating?: number; ratingCount?: number } => {
  if (!o) return {};
  const rating = num(o.rating_bayesian10_point) ?? num(o.actual_rating_value) ?? num(o.rating_value);
  const ratingCount = num(o.rating_count);
  return { rating: rating === undefined ? undefined : Math.round(rating * 10) / 10, ratingCount };
};

const imageOf = (o: JsonObject): string | undefined => {
  const logo = str(o.logo) ?? str(o.restaurant_cdn_image_url);
  if (logo) return logo;
  const mi = o.media_image;
  if (isObject(mi) && str(mi.base_url) && str(mi.public_id)) return `${mi.base_url}${mi.public_id}.${str(mi.format) ?? 'jpg'}`;
  return undefined;
};

function menuItemsOf(list: Json | undefined): GrubhubMenuItem[] {
  if (!Array.isArray(list)) return [];
  const out: GrubhubMenuItem[] = [];
  for (const it of list) {
    if (!isObject(it)) continue;
    const name = str(it.name);
    const id = str(it.id) ?? (num(it.id) !== undefined ? String(it.id) : undefined);
    if (!name || !id) continue;
    // search rows: price is cents; menu_items endpoint: price{amount} with min variation for items that need choices
    const cents =
      firstPositive(
        num(it.price),
        num(get(it, 'price', 'amount')),
        num(get(it, 'delivery_price', 'amount')),
        num(get(it, 'price_display', 'amount', 'price')),
        num(get(it, 'minimum_price_variation', 'amount')),
        num(get(it, 'delivery_minimum_price_variation', 'amount')),
        num(it.minimum_price_variation),
      ) ?? 0;
    const taxRate = num(get(it, 'tax_rate', 'rate'));
    out.push({
      id,
      name,
      price: round2(cents / 100),
      popular: it.popular === true,
      available: it.available === undefined ? undefined : it.available === true,
      category: str(it.menu_category_name) ?? str(it.category_name),
      taxRate: taxRate && taxRate > 0 ? (taxRate > 1 ? taxRate / 100 : taxRate) : undefined,
    });
  }
  return out;
}

const firstPositive = (...vals: Array<number | undefined>): number | undefined => vals.find((v) => v !== undefined && v > 0);

/** search_listing / restaurants/search payload -> rows. Never throws; returns [] for junk. */
export function parseGrubhubSearch(json: string): GrubhubSearchRow[] {
  const root = safeJson(json);
  if (!isObject(root)) return [];
  const results = (Array.isArray(root.results) ? root.results : get(root, 'search_result', 'results')) as Json | undefined;
  if (!Array.isArray(results)) return [];
  const rows: GrubhubSearchRow[] = [];
  for (const r of results) {
    if (!isObject(r)) continue;
    const id = str(r.restaurant_id) ?? (num(r.restaurant_id) !== undefined ? String(r.restaurant_id) : undefined);
    const name = str(r.name);
    if (!id || !name) continue;
    const addr = isObject(r.address) ? r.address : undefined;
    const lower = num(r.delivery_time_estimate_lower_bound);
    const upper = num(r.delivery_time_estimate_upper_bound);
    const single = num(r.delivery_time_estimate);
    const feeCents = num(get(r, 'delivery_fee', 'price')) ?? num(get(r, 'delivery_fee', 'amount'));
    rows.push({
      id,
      name,
      urlPath: str(r.merchant_url_path),
      cuisines: Array.isArray(r.cuisines) ? r.cuisines.filter((c): c is string => typeof c === 'string') : [],
      ...ratingOf(isObject(r.ratings) ? r.ratings : undefined),
      imageUrl: imageOf(r),
      street: addr ? str(addr.street_address) : undefined,
      city: addr ? str(addr.address_locality) ?? str(addr.locality) : undefined,
      zip: addr ? (str(addr.postal_code) ?? str(addr.zip))?.slice(0, 5) : undefined,
      deliveryFee: feeCents === undefined ? undefined : round2(feeCents / 100),
      etaMin: lower ?? single,
      etaMax: upper ?? (single === undefined ? undefined : single + 15),
      distanceMi: num(r.distance_from_location),
      open: typeof r.open === 'boolean' ? r.open : undefined,
      priceTier: num(r.price_rating),
      menuItems: menuItemsOf(r.menu_items),
    });
  }
  return rows;
}

/** restaurants/{id} payload -> store facts. Returns null only when nothing restaurant-like is present. */
export function parseGrubhubRestaurant(json: string): GrubhubStore | null {
  const root = safeJson(json);
  if (!isObject(root)) return null;
  const avail = isObject(root.restaurant_availability) ? root.restaurant_availability : undefined;
  const r = isObject(root.restaurant) ? root.restaurant : isObject(root) && str(root.name) ? root : undefined;
  if (!avail && !r) return null;
  const id = str(avail?.restaurant_id) ?? str(r?.id) ?? (num(r?.id) !== undefined ? String(r?.id) : '');
  const addr = r && isObject(r.address) ? r.address : undefined;
  const ots = r && isObject(r.order_type_settings) ? r.order_type_settings : undefined;
  const sf = ots && isObject(ots.service_fee) ? ots.service_fee : undefined;
  const sfRule = sf && isObject(sf.delivery_fee) ? sf.delivery_fee : sf && isObject(sf.fee) ? sf.fee : undefined;
  const sof = ots && isObject(ots.small_order_fee) ? ots.small_order_fee : undefined;
  const range = avail && isObject(avail.delivery_estimate_range_v2) ? avail.delivery_estimate_range_v2 : parseRangeString(avail?.delivery_estimate_range);
  const estimate = num(avail?.delivery_estimate) ?? num(ots?.delivery_estimate_minutes);
  const rating = ratingOf(r && isObject(r.rating) ? { ...r.rating, rating_bayesian10_point: r.rating_bayesian10_point } : undefined);

  const promoCodes = new Set<string>();
  const offers: string[] = [];
  for (const key of ['available_promo_codes', 'restaurant_coupons', 'available_offers', 'available_progress_campaigns'] as const) {
    const list = r?.[key];
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (typeof p === 'string') promoCodes.add(p);
      else if (isObject(p)) {
        const code = str(p.code) ?? str(p.promo_code) ?? str(p.coupon_code);
        if (code) promoCodes.add(code);
        const text = str(p.description) ?? str(p.title) ?? str(p.display_text) ?? str(p.name);
        if (text) offers.push(text);
      }
    }
  }

  return {
    id,
    name: str(r?.name),
    street: addr ? str(addr.street_address) : undefined,
    city: addr ? str(addr.locality) ?? str(addr.address_locality) : undefined,
    zip: addr ? (str(addr.zip) ?? str(addr.postal_code))?.slice(0, 5) : undefined,
    cuisines: Array.isArray(r?.cuisines) ? r!.cuisines.filter((c): c is string => typeof c === 'string') : [],
    ...rating,
    imageUrl: r ? imageOf(r) : undefined,
    priceTier: num(r?.price_rating),
    deliveryFee: centsToDollars(get(avail, 'delivery_fee', 'amount')),
    deliveryFeeWithoutDiscounts: centsToDollars(get(avail, 'delivery_fee_without_discounts', 'amount')),
    salesTaxPct: num(avail?.sales_tax),
    etaMin: num(range?.minimum) ?? estimate,
    etaMax: num(range?.maximum) ?? (estimate === undefined ? undefined : estimate + 10),
    orderMinimum: centsToDollars(get(avail, 'order_minimum', 'amount')),
    serviceFeePct: sfRule && str(sfRule.fee_type)?.toUpperCase() === 'PERCENT' ? num(sfRule.percent_value) : undefined,
    serviceFeeMax: centsToDollars(get(sfRule, 'maximum_amount_for_percent', 'amount')),
    serviceFeeFlat: sfRule && str(sfRule.fee_type)?.toUpperCase() === 'FLAT' ? centsToDollars(get(sfRule, 'flat_cents_value', 'amount')) : undefined,
    smallOrderFee: centsToDollars(get(sof, 'fee', 'flat_cents_value', 'amount')) ?? centsToDollars(get(sof, 'fee_cents')),
    smallOrderBelow: centsToDollars(sof?.minimum_order_value_cents),
    open: typeof avail?.open_delivery === 'boolean' ? avail.open_delivery : typeof avail?.open === 'boolean' ? avail.open : undefined,
    deliversHere: typeof avail?.delivery_offered_to_diner_location === 'boolean' ? avail.delivery_offered_to_diner_location : undefined,
    promoCodes: [...promoCodes],
    offers,
  };
}

function parseRangeString(v: Json | undefined): JsonObject | undefined {
  if (typeof v !== 'string') return undefined;
  const j = safeJson(v);
  return isObject(j) ? j : undefined;
}

/** menu_items payload (or any payload containing a `menu_items` array) -> items with dollar prices. */
export function parseGrubhubMenuItems(json: string): GrubhubMenuItem[] {
  const root = safeJson(json);
  if (root === undefined) return [];
  const direct = isObject(root) && Array.isArray(root.menu_items) ? root.menu_items : undefined;
  if (direct) return menuItemsOf(direct);
  const holders = findObjects(root, (o) => Array.isArray(o.menu_items));
  return holders.flatMap((h) => menuItemsOf(h.menu_items));
}

export interface GrubhubFeeLines {
  deliveryFee: number;
  serviceFee: number;
  smallOrderFee: number;
  tax: number;
  /** true when no tax rate was available and the default was used */
  taxEstimated: boolean;
}

/**
 * The fee lines Grubhub's checkout shows for a delivery subtotal, from the rules on the
 * restaurant payload. `defaultTaxRate` is only used when the payload has no sales_tax.
 */
export function grubhubFeeLines(store: GrubhubStore, subtotal: number, defaultTaxRate = 0.07): GrubhubFeeLines {
  const deliveryFee = store.deliveryFee ?? 0;
  let serviceFee = 0;
  if (store.serviceFeePct !== undefined) {
    serviceFee = subtotal * (store.serviceFeePct / 100);
    if (store.serviceFeeMax !== undefined) serviceFee = Math.min(serviceFee, store.serviceFeeMax);
  } else if (store.serviceFeeFlat !== undefined) {
    serviceFee = store.serviceFeeFlat;
  }
  const smallOrderFee =
    store.smallOrderFee !== undefined && store.smallOrderBelow !== undefined && subtotal < store.smallOrderBelow ? store.smallOrderFee : 0;
  const taxEstimated = store.salesTaxPct === undefined;
  const rate = taxEstimated ? defaultTaxRate : store.salesTaxPct! / 100;
  return { deliveryFee: round2(deliveryFee), serviceFee: round2(serviceFee), smallOrderFee: round2(smallOrderFee), tax: round2(subtotal * rate), taxEstimated };
}

/**
 * Pick what to price: cart lines matched by name (quantity-aware) when possible,
 * otherwise a representative item (first popular, else the median-priced dish).
 */
export function pickGrubhubSubtotal(
  items: GrubhubMenuItem[],
  cart: Array<{ name: string; quantity: number; unitPrice?: number }>,
): { subtotal: number; matched: GrubhubMenuItem[]; representative?: GrubhubMenuItem } {
  const priced = items.filter((i) => i.price > 0 && i.available !== false);
  const matched: GrubhubMenuItem[] = [];
  let subtotal = 0;
  for (const line of cart) {
    const hit = priced.find((i) => nameMatches(i.name, line.name));
    if (hit) {
      matched.push(hit);
      subtotal += hit.price * Math.max(1, line.quantity);
    }
  }
  if (matched.length > 0) return { subtotal: round2(subtotal), matched };
  const representative = priced.find((i) => i.popular) ?? [...priced].sort((a, b) => a.price - b.price)[Math.floor(priced.length / 2)];
  return { subtotal: representative ? round2(representative.price) : 0, matched, representative };
}

/** Grubhub offer copy -> OfferPromo when it is machine-readable. */
export function grubhubPromo(store: GrubhubStore, now = new Date()): OfferPromo | undefined {
  for (const text of store.offers) {
    const p = parsePromoText(text, store.promoCodes[0], now);
    if (p) return p;
  }
  return undefined;
}
