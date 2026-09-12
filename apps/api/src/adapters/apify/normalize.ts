/**
 * Apify actor output -> our domain shapes.
 *
 * Every DoorDash / Uber Eats / Grubhub actor on the Apify Store emits its own
 * field names (`title` vs `name` vs `storeName`, `deliveryFee` vs `fees.delivery`
 * vs `delivery_fee_cents`, …) and the shape changes when the actor is updated.
 * So instead of coding to one actor we resolve each field from a list of
 * aliases, looking at the top level first and then a bounded depth-first walk.
 *
 * Everything here is pure, so the tests below pin the behaviour against
 * fixtures without touching the network.
 */
import type { PlatformSlug } from '../../models/types';
import type { PlatformListing } from '../types';
import { DEFAULT_FIELDS, type FieldAliases } from './fields';
import { centsToDollars, isObject, num, parseEta, parseMoney, parseRating, richText, round2, str, type Json, type JsonObject } from '../parsers/common';

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

const norm = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * First value whose key matches one of `aliases` (compared without case or
 * punctuation, so `delivery_fee`, `deliveryFee` and `DeliveryFee` all match
 * "deliveryfee").
 *
 * Resolution order is depth first, then alias order:
 *  - a shallower key always beats a deeper one, so a menu item's `uuid` two
 *    levels down can never outrank the store's own `slug` at the top level;
 *  - within one depth the alias list acts as a preference order, so
 *    `['storeId', …, 'slug']` takes `storeId` when a row has both, regardless of
 *    which one JSON happens to list first.
 */
export function pickField(root: unknown, aliases: string[], maxDepth = 3): Json | undefined {
  const wanted = aliases.map(norm);
  const seen = new Set<object>();
  let level: unknown[] = [root];
  for (let depth = 0; depth <= maxDepth && level.length; depth += 1) {
    const objects: JsonObject[] = [];
    const next: unknown[] = [];
    for (const node of level) {
      if (node === null || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const v of node.slice(0, 20)) next.push(v);
        continue;
      }
      objects.push(node as JsonObject);
      for (const v of Object.values(node)) next.push(v);
    }
    for (const alias of wanted) {
      for (const o of objects) {
        for (const [k, v] of Object.entries(o)) {
          if (v !== null && v !== undefined && norm(k) === alias) return v as Json;
        }
      }
    }
    level = next;
  }
  return undefined;
}

const pickStr = (root: unknown, aliases: string[], maxDepth = 3): string | undefined => {
  const v = pickField(root, aliases, maxDepth);
  return richText(v) ?? str(v) ?? (typeof v === 'number' ? String(v) : undefined);
};

/**
 * Money out of whatever the actor emitted:
 *   2.99 | "2.99" | "$2.99" | "Free" | 299 under a *Cents key
 *   | {amount: 299, currencyCode: 'USD'} | {unitAmount: 299} | {displayString: "$2.99"}
 *   | {unit_amount: 1150, display_string: "CA$11.50", decimal_places: 2}
 *
 * Only a key that literally says "cents" is taken as minor units. A sibling
 * `*Amount` is *not*: `delivery_fee_amount: 3` is as likely to be three dollars
 * as three cents, and guessing wrong is a 100x price error.
 */
export function pickMoney(root: unknown, aliases: string[], maxDepth = 3): number | undefined {
  for (const alias of aliases) {
    const centsKey = pickField(root, [`${alias}Cents`, `${alias}InCents`], maxDepth);
    const cents = centsToDollars(centsKey);
    if (cents !== undefined && Number.isInteger(num(centsKey))) return cents;
  }
  return toMoney(pickField(root, aliases, maxDepth));
}

/** Value of the first own key matching one of `names`, compared loosely (`display_string` ≡ `displayString`). */
const own = (o: JsonObject, names: string[]): Json | undefined => {
  const wanted = names.map(norm);
  for (const name of wanted) {
    for (const [k, v] of Object.entries(o)) {
      if (v !== null && v !== undefined && norm(k) === name) return v as Json;
    }
  }
  return undefined;
};

export function toMoney(v: Json | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return parseMoney(v);
  if (Array.isArray(v)) return toMoney(v[0]);
  if (isObject(v)) {
    const amount = num(own(v, ['unitAmount', 'amount', 'value', 'price']));
    // `decimal_places` states the scale outright — no heuristic needed.
    const decimals = num(own(v, ['decimalPlaces', 'decimals', 'exponent']));
    if (amount !== undefined && decimals !== undefined && decimals >= 0 && decimals <= 6) return amount / 10 ** decimals;
    const display = str(own(v, ['displayString', 'display', 'displayAmount', 'formatted', 'priceString', 'text', 'label']));
    if (display) return parseMoney(display);
    const currency = str(own(v, ['currencyCode', 'currency']));
    // {amount: 299, currencyCode: 'USD'} is minor units; {amount: 2.99} is dollars.
    if (amount !== undefined && currency && Number.isInteger(amount) && Math.abs(amount) >= 100) return amount / 100;
    return amount;
  }
  return undefined;
}

/** ETA from a `{min, max}` object, a pair of fields, or free text like "25-40 min". */
export function pickEta(root: unknown, f: FieldAliases = DEFAULT_FIELDS): { etaMin?: number; etaMax?: number } {
  // `deliveryEtaMinutes: {min: 20, max: 35}` — a range object under one key.
  const range = pickField(root, f.eta, 2);
  if (isObject(range)) {
    const lo = num(range.min ?? range.minimum ?? range.low ?? range.from);
    const hi = num(range.max ?? range.maximum ?? range.high ?? range.to);
    if (lo !== undefined) return { etaMin: lo, etaMax: hi ?? lo + 10 };
  }
  const min = num(pickField(root, f.etaMin));
  const max = num(pickField(root, f.etaMax));
  if (min !== undefined) return { etaMin: min, etaMax: max ?? min + 10 };
  const text = pickStr(root, f.eta);
  const parsed = parseEta(text);
  if (parsed) return { etaMin: parsed[0], etaMax: parsed[1] };
  const n = num(pickField(root, f.eta.filter((k) => /time|duration/i.test(k))));
  return n !== undefined ? { etaMin: n, etaMax: n + 10 } : {};
}

const toArray = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** First readable string under `aliases`, looking inside arrays (`promotions: [...]`). */
export function pickText(root: unknown, aliases: string[], maxDepth = 3): string | undefined {
  const v = pickField(root, aliases, maxDepth);
  for (const entry of toArray(v)) {
    const s = richText(entry) ?? str(entry);
    if (s) return s;
  }
  return undefined;
}

/** cuisines / categories / tags, in any of the shapes actors use for them. */
export function pickCuisines(root: unknown, f: FieldAliases = DEFAULT_FIELDS): string[] {
  const raw = pickField(root, f.cuisine, 2);
  const out = toArray(raw)
    .map((c) => richText(c) ?? str(c) ?? (isObject(c) ? str(c.name) ?? str(c.title) : undefined))
    .filter((c): c is string => !!c)
    .flatMap((c) => c.split(/\s*[,•|]\s*/))
    .map((c) => c.trim())
    // `categories` often leads with the price bucket ("$", "$$") — not a cuisine.
    .filter((c) => c.length > 1 && c.length < 40 && !/^\$+$/.test(c));
  return [...new Set(out)].slice(0, 6);
}

/**
 * Rating and rating count, which arrive either as flat fields or as one object
 * (`rating: {ratingValue: 4.5, ratingCount: "140+"}`), and whose count is often
 * display text rather than a number ("140+", "1,840", "2k+").
 */
export function pickRating(root: unknown, f: FieldAliases = DEFAULT_FIELDS): { rating?: number; ratingCount?: number } {
  const raw = pickField(root, f.rating, 2);
  // "4.6 (1,840 ratings)" — some actors only publish the badge text.
  const ratingText = pickStr(root, f.ratingText, 2);
  const rating = isObject(raw)
    ? num(raw.ratingValue ?? raw.value ?? raw.rating ?? raw.average ?? raw.exactValue)
    : num(raw) ?? parseRating(str(raw) ?? ratingText).rating;
  const countRaw = pickField(root, f.ratingCount, 3);
  const ratingCount = parseCount(countRaw) ?? parseRating(ratingText).ratingCount;
  return {
    ...(rating !== undefined && rating > 0 ? { rating: Math.round(rating * 10) / 10 } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
  };
}

/** "140+" | "1,840" | "2k+" | 1840 -> 1840 */
export function parseCount(v: Json | undefined): number | undefined {
  const n = num(v);
  if (n !== undefined) return Math.round(n);
  const s = str(v);
  const m = s?.replace(/,/g, '').match(/([\d.]+)\s*(k|m)?/i);
  if (!m) return undefined;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return Math.round(base * mult);
}

/** Store id, falling back to the numeric/uuid tail of the store URL. */
export function pickStoreId(root: unknown, platform: PlatformSlug, f: FieldAliases = DEFAULT_FIELDS): string | undefined {
  const direct = pickStr(root, f.storeId, 2);
  if (direct && !/^https?:/i.test(direct)) return direct;
  const url = pickStr(root, f.url, 2);
  return url ? storeIdFromUrl(url, platform) : undefined;
}

export function storeIdFromUrl(url: string, platform: PlatformSlug): string | undefined {
  if (platform === 'doordash') return url.match(/\/store\/(?:[^/?#]*-)?(\d+)/)?.[1] ?? url.match(/\/store\/([^/?#]+)/)?.[1];
  if (platform === 'ubereats') return url.match(/\/store\/[^/]+\/([0-9a-f-]{36})/i)?.[1] ?? url.match(/\/store\/([^/?#]+)/)?.[1];
  return url.match(/\/restaurant\/([^/?#]+)/)?.[1] ?? url.match(/\/(\d{5,})(?:\/|$)/)?.[1];
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/** One dataset row -> a PlatformListing, or null when it is not a store row. */
export function normalizeListing(item: unknown, platform: PlatformSlug, zip: string, f: FieldAliases = DEFAULT_FIELDS): PlatformListing | null {
  if (!isObject(item)) return null;
  const name = pickStr(item, f.name, 2);
  const id = pickStoreId(item, platform, f);
  if (!name || !id) return null;

  const address = addressOf(item, f);
  const rating = pickRating(item, f);
  const eta = pickEta(item, f);

  return {
    platformSlug: platform,
    platformRestaurantId: String(id),
    name,
    address: address.street ?? '',
    zip: address.zip ?? zip,
    cuisine: pickCuisines(item, f),
    ...rating,
    ...definedOnly({
      imageUrl: pickStr(item, f.image, 2),
      url: pickStr(item, f.url, 2),
      deliveryFee: pickMoney(item, f.deliveryFee),
    }),
    ...eta,
  };
}

/** Street + zip out of a string address, an address object, or separate fields. */
export function addressOf(item: unknown, f: FieldAliases = DEFAULT_FIELDS): { street?: string; zip?: string } {
  const raw = pickField(item, f.address, 2);
  let street = str(raw);
  let zip = pickStr(item, f.zip, 3);
  if (isObject(raw)) {
    // Nested address objects name the line every possible way, so resolve by alias too.
    street = pickStr(raw, f.street, 2);
    zip ??= pickStr(raw, f.zip, 2);
  }
  if (street && !zip) zip = street.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  // "3703 Forbes Ave, Pittsburgh, PA 15213" -> street line only; the matcher keys off the number.
  if (street?.includes(',')) street = street.split(',')[0].trim();
  return { ...(street ? { street } : {}), ...(zip && /^\d{5}$/.test(zip) ? { zip } : {}) };
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export interface ApifyMenuItem {
  name: string;
  price: number;
}

const menuKeySet = (f: FieldAliases): Set<string> => new Set(f.menuContainers.map(norm));

/** A price only from a *string* field, so `price: 1799` can never be mistaken for $1799. */
function formattedPrice(node: JsonObject, f: FieldAliases): number | undefined {
  const v = pickField(node, f.itemPriceText, 1);
  const s = typeof v === 'string' ? v : richText(v);
  return s ? parseMoney(s) : undefined;
}

interface RawMenuItem extends ApifyMenuItem {
  /** Price came from a formatted string, so it is already in dollars. */
  fromText: boolean;
  /** The numeric field's value, when there was one — used to detect the scale. */
  raw?: number;
}

/**
 * Uber Eats reports menu prices in cents (`price: 1799`, `priceTagline: "$17.99"`),
 * and actors pass that straight through. Guessing per value is unsafe, so the
 * scale is decided for the menu as a whole:
 *
 *  - if any item has both a number and a formatted string, their ratio settles it;
 *  - otherwise, a menu where every item is >= 100 and something is >= 1000 is cents
 *    (no restaurant's cheapest dish is $100).
 */
export function detectPriceScale(items: RawMenuItem[]): number {
  const paired = items.filter((i) => i.fromText && i.raw !== undefined && i.raw > 0 && i.price > 0);
  if (paired.length) {
    const ratios = paired.map((i) => i.raw! / i.price).sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)] > 50 ? 100 : 1;
  }
  const numeric = items.filter((i) => !i.fromText).map((i) => i.price);
  if (numeric.length >= 3 && numeric.every((p) => p >= 100) && numeric.some((p) => p >= 1000)) return 100;
  return 1;
}

/**
 * Menu items out of a store row. Handles flat `menuItems: [...]`, nested
 * `menu: [{items: [...]}]` / `categories: [{ items | products | menuItems }]`,
 * and rows that are themselves a single menu item.
 *
 * It descends into *every* menu-ish key rather than the first one that matches:
 * `categories` is cuisine tags on some actors and menu sections on others, and
 * requiring both a name and a positive price is what tells the two apart.
 */
export function normalizeMenu(item: unknown, f: FieldAliases = DEFAULT_FIELDS): ApifyMenuItem[] {
  const MENU_KEYS = menuKeySet(f);
  const out: RawMenuItem[] = [];
  const seen = new Set<string>();
  const push = (node: Json): void => {
    if (!isObject(node) || isSection(node, MENU_KEYS)) return;
    const name = pickStr(node, f.itemName, 1);
    if (!name) return;
    // Depth 1 only: a section must not inherit the price of the first item under it.
    // `{price: {amount: 299, currencyCode}}` still resolves, since toMoney unwraps the object.
    const text = formattedPrice(node, f);
    const raw = pickMoney(node, f.itemPriceNum, 1);
    const price = text ?? raw;
    if (price === undefined || price <= 0) return;
    const key = `${name.toLowerCase()}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, price, fromText: text !== undefined, ...(raw !== undefined ? { raw } : {}) });
  };

  const walk = (node: Json | undefined, depth: number): void => {
    if (depth > 6 || node === null || node === undefined || out.length > 400) return;
    if (Array.isArray(node)) {
      for (const n of node.slice(0, 400)) walk(n, depth + 1);
      return;
    }
    if (!isObject(node)) return;
    if (depth > 0) push(node);
    for (const key of Object.keys(node)) {
      if (MENU_KEYS.has(norm(key))) walk(node[key], depth + 1);
    }
  };

  walk((item ?? null) as Json, 0);
  // The row is itself one menu item (actors that emit one row per dish) — but
  // only when it is not a store row. A store carrying a price *tier*
  // (`price: 2`, `priceLevel: 1`) must never be priced as a $2 dish.
  if (out.length === 0 && isObject(item) && !looksLikeStore(item, f)) push(item as Json);

  const scale = detectPriceScale(out);
  return out.map((i) => ({ name: i.name, price: round2(i.fromText ? i.price : i.price / scale) }));
}

/** A menu section ("Noodles" holding `items`), not a priceable item. */
const isSection = (node: JsonObject, menuKeys: Set<string>): boolean =>
  Object.entries(node).some(([k, v]) => menuKeys.has(norm(k)) && Array.isArray(v) && v.length > 0);

/** Does this row describe a restaurant rather than a dish? */
export function looksLikeStore(row: JsonObject, f: FieldAliases = DEFAULT_FIELDS): boolean {
  const keys = new Set(Object.keys(row).map(norm));
  return [...f.address, ...f.cuisine, ...f.rating, ...f.ratingCount, ...f.deliveryFee, ...f.eta, 'addressText', 'menuItemCount', 'hours', 'priceBucket', 'priceLevel']
    .map(norm)
    .some((k) => keys.has(k));
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export interface ApifyFees {
  deliveryFee?: number;
  serviceFee?: number;
  smallOrderFee?: number;
  tax?: number;
  etaMin?: number;
  etaMax?: number;
  promoText?: string;
}

/** Fee lines, when the actor surfaces them. Anything missing stays undefined (never invented). */
export function normalizeFees(item: unknown, f: FieldAliases = DEFAULT_FIELDS): ApifyFees {
  const promo = pickText(item, f.promo, 3);
  return {
    ...pickEta(item, f),
    ...definedOnly({
      deliveryFee: pickMoney(item, f.deliveryFee),
      serviceFee: pickMoney(item, f.serviceFee),
      smallOrderFee: pickMoney(item, f.smallOrderFee),
      tax: pickMoney(item, f.tax),
      promoText: promo,
    }),
  };
}

const definedOnly = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Dataset rows sometimes arrive wrapped: `{results: [...]}` / `{stores: [...]}` / `{data: [...]}`. */
export function unwrapRows(rows: unknown[], f: FieldAliases = DEFAULT_FIELDS): JsonObject[] {
  const out: JsonObject[] = [];
  for (const row of rows) {
    if (!isObject(row)) continue;
    const nested = ['results', 'stores', 'restaurants', 'data', 'items'].map((k) => row[k]).find((v) => Array.isArray(v) && v.length && isObject(v[0]));
    if (Array.isArray(nested)) out.push(...(nested.filter(isObject) as JsonObject[]));
    else out.push(row);
  }
  return joinFlatRows(out, f);
}

// ---------------------------------------------------------------------------
// Flat datasets
// ---------------------------------------------------------------------------

/**
 * Some actors emit a *flat* dataset — one row per store and one row per menu
 * item, joined by a store key, tagged with `recordType: "store" | "menuItem"`
 * (solidcode/ubereats-full-menu-scraper works exactly this way). Left alone,
 * every dish would be read as its own restaurant.
 *
 * So fold item rows into their store row under `menuItems`, which normalizeMenu
 * already understands. Datasets that are one row per store pass through
 * untouched.
 */
export function joinFlatRows(rows: JsonObject[], f: FieldAliases = DEFAULT_FIELDS): JsonObject[] {
  const items = new Map<string, JsonObject[]>();
  const stores: JsonObject[] = [];
  const orphanKeys: string[] = [];

  for (const row of rows) {
    if (!isItemRow(row, f)) {
      stores.push(row);
      continue;
    }
    const key = joinKey(row, f);
    if (!key) continue; // an item we cannot attach to any store is not a restaurant
    if (!items.has(key)) {
      items.set(key, []);
      orphanKeys.push(key);
    }
    items.get(key)!.push(row);
  }
  if (items.size === 0) return stores;

  const claimed = new Set<string>();
  const joined = stores.map((store) => {
    const key = [joinKey(store, f), pickStr(store, f.storeId, 1), canonicalUrl(pickStr(store, f.url, 1))]
      .filter((k): k is string => !!k)
      .find((k) => items.has(k));
    if (!key) return store;
    claimed.add(key);
    // Keep whatever the store row already had; `menuItems` is what normalizeMenu walks.
    const existing = Array.isArray(store.menuItems) ? store.menuItems : [];
    return { ...store, menuItems: [...existing, ...items.get(key)!] };
  });

  // Items whose store row never appeared (store URLs run without discovery):
  // synthesise a store row from the item's own store fields.
  for (const key of orphanKeys) {
    if (claimed.has(key)) continue;
    const group = items.get(key)!;
    const first = group[0];
    const name = pickStr(first, ['storeName', 'restaurantName', 'merchantName'], 1);
    const url = pickStr(first, ['storeUrl', 'restaurantUrl'], 1);
    if (!name && !url) continue;
    joined.push({ ...(name ? { name } : {}), ...(url ? { storeUrl: url } : {}), storeId: key, menuItems: group });
  }
  return joined;
}

/** Is this row a menu item rather than a store? */
export function isItemRow(row: JsonObject, f: FieldAliases = DEFAULT_FIELDS): boolean {
  const tag = pickStr(row, f.recordType, 1)?.toLowerCase();
  if (tag) {
    if (/item|menu|product|dish|food/.test(tag)) return true;
    if (/store|restaurant|merchant|shop|venue|business/.test(tag)) return false;
  }
  // No discriminator: an item has a price and points at a store, but has none
  // of the things only a store has.
  const hasStoreKey = !!pickField(row, ['storeId', 'storeUrl', 'restaurantId', 'restaurantUrl'], 1);
  const hasPrice = pickMoney(row, [...f.itemPriceNum, ...f.itemPriceText], 1) !== undefined;
  const hasStoreFields = !!pickField(row, ['address', 'addressText', 'cuisines', 'deliveryFee', 'rating', 'menuItemCount', 'hours'], 1);
  return hasStoreKey && hasPrice && !hasStoreFields;
}

const joinKey = (row: JsonObject, f: FieldAliases): string | undefined =>
  pickStr(row, f.joinKey, 1) ?? canonicalUrl(pickStr(row, ['storeUrl', 'restaurantUrl'], 1));

/** Store URLs differ per row by query string (`?diningMode=DELIVERY`), so join on the path. */
const canonicalUrl = (url: string | undefined): string | undefined => (url ? url.split(/[?#]/)[0].replace(/\/+$/, '') : undefined);
