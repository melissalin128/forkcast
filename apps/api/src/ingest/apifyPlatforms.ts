/**
 * Bulk DoorDash / Uber Eats catalogue from cheaper Apify Store actors
 * (`dz_omar/doordash-scraper` and `borderline/uber-eats-scraper-ppr`).
 *
 *   npm run ingest -- --only apify \
 *     --doordash-dataset <id> --ubereats-dataset <id>
 *
 * Observed menus are stored with synthetic: false. Checkout tax/tip/service
 * fee are still not on these actors — we record listed delivery fee + ETA
 * and a representative item total, labeled source apify-doordash / apify-ubereats.
 */
import { OfferModel, MenuItemModel, PlatformScrapeModel, PriceSnapshotModel, RestaurantModel, packPayload, type DietaryTag } from '../models';
import { DIETARY_TAGS, type PlatformSlug } from '../models/types';
import { config } from '../config';
import { matchKey } from '../matcher/restaurantMatcher';
import { round2 } from '../pricing/computeTotal';
import { slugify } from '../seed/data';
import { bulkUpsert, done, tick } from './common';

const ACTORS = {
  doordash: 'dz_omar/doordash-scraper',
  ubereats: 'borderline/uber-eats-scraper-ppr',
} as const;

export interface ParsedItem {
  name: string;
  category?: string;
  description?: string;
  price?: number;
  dietary: DietaryTag[];
}

export interface ParsedStore {
  platformSlug: PlatformSlug;
  storeId: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  url?: string;
  rating: number;
  ratingCount: number;
  priceTier: 1 | 2 | 3;
  cuisine: string[];
  imageUrl?: string;
  phone?: string;
  deliveryFee: number;
  etaMin: number;
  items: ParsedItem[];
  payload: Record<string, unknown>;
}

export function parseMoney(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 1000 && Number.isInteger(v)) return round2(v / 100);
    return round2(v);
  }
  const t = String(v ?? '').trim();
  if (!t) return undefined;
  const cents = t.match(/(\d+)\s*cents/i);
  if (cents) return round2(Number(cents[1]) / 100);
  const m = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return round2(Number(m[1]));
}

export function parseZip(address: string, extra?: unknown): string {
  const fromExtra = String(extra ?? '').match(/\b(\d{5})\b/);
  if (fromExtra) return fromExtra[1];
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : '15213';
}

export function parseTier(v: unknown): 1 | 2 | 3 {
  if (typeof v === 'number' && v >= 1 && v <= 3) return Math.round(v) as 1 | 2 | 3;
  const t = String(v ?? '');
  const dollars = (t.match(/\$/g) ?? []).length;
  if (dollars >= 3) return 3;
  if (dollars === 1) return 1;
  if (dollars === 2) return 2;
  const n = Number(t);
  if (n === 1 || n === 2 || n === 3) return n;
  return 2;
}

export function parseCount(v: unknown): number {
  const t = String(v ?? '').replace(/,/g, '');
  const m = t.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function dietFromText(...parts: unknown[]): DietaryTag[] {
  const blob = parts.map((p) => String(p ?? '').toLowerCase()).join(' ');
  const out: DietaryTag[] = [];
  for (const tag of DIETARY_TAGS) {
    if (tag === 'gluten-free' && /gluten[-\s]?free/.test(blob)) out.push(tag);
    else if (tag !== 'gluten-free' && blob.includes(tag)) out.push(tag);
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function parseDoorDashStore(raw: Record<string, unknown>): ParsedStore | undefined {
  const storeId = String(raw.store_id ?? raw.storeId ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!storeId || !name) return undefined;
  const address = String(raw.address ?? raw.street ?? '').trim();
  const loc = asRecord(raw.contact)?.address as Record<string, unknown> | undefined;
  const lat = Number(raw.lat ?? raw.latitude ?? loc?.latitude);
  const lng = Number(raw.lng ?? raw.longitude ?? loc?.longitude);
  const items: ParsedItem[] = [];
  for (const cat of asArray(raw.menu_categories)) {
    const c = asRecord(cat);
    if (!c) continue;
    const category = String(c.category_name ?? c.name ?? '') || undefined;
    for (const it of asArray(c.items)) {
      const row = asRecord(it);
      if (!row) continue;
      const itemName = String(row.name ?? '').trim();
      if (!itemName) continue;
      const price = parseMoney(row.price_cents ?? row.price_display ?? row.price);
      items.push({
        name: itemName,
        category,
        description: String(row.description ?? '').slice(0, 240) || undefined,
        price,
        dietary: dietFromText(row.description, asArray(row.dietaryTags).join(' ')),
      });
    }
  }
  if (items.length === 0) {
    const featured = asRecord(raw.featured_items);
    for (const it of asArray(featured?.items)) {
      const row = asRecord(it);
      if (!row) continue;
      const itemName = String(row.name ?? '').trim();
      if (!itemName) continue;
      items.push({
        name: itemName,
        category: 'Featured',
        price: parseMoney(row.price_cents ?? row.price_display),
        dietary: [],
      });
    }
  }
  const tags = asArray(raw.tags)
    .map((t) => {
      const r = asRecord(t);
      return String(r?.name ?? t ?? '');
    })
    .filter(Boolean);

  return {
    platformSlug: 'doordash',
    storeId,
    name,
    address: address || 'Pittsburgh, PA',
    zip: parseZip(address, raw.postal_code),
    lat: Number.isFinite(lat) ? lat : 40.4406,
    lng: Number.isFinite(lng) ? lng : -79.9559,
    url: String(raw.url ?? `https://www.doordash.com/store/${storeId}/`),
    rating: Math.min(5, Math.max(0, Number(raw.rating) || 0)),
    ratingCount: parseCount(raw.num_ratings ?? raw.num_reviews),
    priceTier: parseTier(raw.price_range ?? raw.price_range_display),
    cuisine: tags.slice(0, 8),
    imageUrl: String(raw.cover_image ?? raw.header_image ?? '') || undefined,
    deliveryFee: parseMoney(raw.delivery_fee_display) ?? 0,
    etaMin: Math.round(Number(raw.asap_minutes) || 35),
    items,
    payload: raw,
  };
}

export function parseUberStore(raw: Record<string, unknown>): ParsedStore | undefined {
  const storeId = String(raw.uuid ?? raw.storeId ?? '').trim();
  const name = String(raw.title ?? raw.name ?? '').trim();
  if (!storeId || !name) return undefined;
  const loc = asRecord(raw.location) ?? {};
  const address = String(loc.streetAddress ?? loc.address ?? '').trim();
  const rating = asRecord(raw.rating) ?? {};
  const fee = asRecord(raw.deliveryFee) ?? {};
  const eta = asRecord(raw.etaMinutes) ?? {};
  const items: ParsedItem[] = [];
  for (const section of asArray(raw.menu)) {
    const sec = asRecord(section);
    if (!sec) continue;
    const category = String(sec.catalogName ?? sec.name ?? '') || undefined;
    for (const it of asArray(sec.catalogItems ?? sec.items)) {
      const row = asRecord(it);
      if (!row) continue;
      const itemName = String(row.title ?? row.name ?? '').trim();
      if (!itemName) continue;
      items.push({
        name: itemName,
        category,
        description: String(row.itemDescription ?? row.description ?? '').slice(0, 240) || undefined,
        price: parseMoney(row.price ?? row.priceTagline),
        dietary: dietFromText(row.itemDescription, row.titleBadge, asArray(row.tags).join(' ')),
      });
    }
  }
  if (items.length === 0) {
    for (const it of asArray(raw.featuredItems)) {
      const row = asRecord(it);
      if (!row) continue;
      const itemName = String(row.title ?? row.name ?? '').trim();
      if (!itemName) continue;
      items.push({
        name: itemName,
        category: 'Featured',
        price: parseMoney(row.price ?? row.priceTagline),
        dietary: [],
      });
    }
  }
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  return {
    platformSlug: 'ubereats',
    storeId,
    name,
    address: address || 'Pittsburgh, PA',
    zip: parseZip(address, loc.postalCode),
    lat: Number.isFinite(lat) ? lat : 40.4406,
    lng: Number.isFinite(lng) ? lng : -79.9559,
    url: String(raw.url ?? ''),
    rating: Math.min(5, Math.max(0, Number(rating.ratingValue ?? rating.exactValue) || 0)),
    ratingCount: parseCount(rating.ratingCount ?? rating.reviewCount),
    priceTier: parseTier(raw.priceBucket),
    cuisine: [...new Set(asArray(raw.cuisineList).map((c) => String(c)).filter(Boolean))].slice(0, 8),
    imageUrl: String(raw.heroImageUrl ?? raw.logoImageUrl ?? '') || undefined,
    phone: String(raw.phoneNumber ?? '') || undefined,
    deliveryFee: parseMoney(fee.amount ?? fee.text) ?? 0,
    etaMin: Math.round(Number(eta.min ?? eta.max) || 35),
    items,
    payload: raw,
  };
}

async function fetchDataset(datasetId: string, token: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true&offset=${offset}&limit=${limit}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Apify dataset ${datasetId}: HTTP ${res.status}`);
    const page = (await res.json()) as unknown;
    if (!Array.isArray(page) || page.length === 0) break;
    for (const row of page) {
      if (row && typeof row === 'object') out.push(row as Record<string, unknown>);
    }
    if (page.length < limit) break;
    tick('apify-download', out.length, out.length + 1);
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const [, inline] = process.argv[i].split('=');
  return inline ?? process.argv[i + 1];
}

function pickSample(items: ParsedItem[]): { name: string; menuPrice: number } {
  const priced = items.filter((i) => i.price && i.price >= 5 && i.price <= 40);
  const pool = priced.length > 0 ? priced : items.filter((i) => i.price);
  const hit = pool[0];
  return { name: hit?.name ?? 'Popular item', menuPrice: hit?.price ?? 14.99 };
}

export async function ingestApifyDatasets(opts?: {
  doordashDataset?: string;
  ubereatsDataset?: string;
  doordashRunId?: string;
  ubereatsRunId?: string;
}): Promise<{ restaurants: number; menuItems: number; scrapes: number; snapshots: number }> {
  const token = config.apifyToken;
  if (!token) throw new Error('APIFY_TOKEN is not set');

  const ddId = opts?.doordashDataset ?? arg('doordash-dataset') ?? process.env.APIFY_DOORDASH_DATASET_ID;
  const ueId = opts?.ubereatsDataset ?? arg('ubereats-dataset') ?? process.env.APIFY_UBEREATS_DATASET_ID;
  if (!ddId && !ueId) throw new Error('pass --doordash-dataset and/or --ubereats-dataset');

  const stores: ParsedStore[] = [];
  if (ddId) {
    const rows = await fetchDataset(ddId, token);
    for (const row of rows) {
      const parsed = parseDoorDashStore(row);
      if (parsed) stores.push(parsed);
    }
  }
  if (ueId) {
    const rows = await fetchDataset(ueId, token);
    for (const row of rows) {
      const parsed = parseUberStore(row);
      if (parsed) stores.push(parsed);
    }
  }

  const existing = await RestaurantModel.find({}, { name: 1, address: 1, platformIds: 1, slug: 1 }).lean();
  const byKey = new Map(existing.map((r) => [matchKey(r.name, r.address), r]));
  const byPlatform = new Map<string, (typeof existing)[number]>();
  for (const r of existing) {
    const ids = r.platformIds ?? {};
    if (ids.doordash) byPlatform.set(`doordash:${ids.doordash}`, r);
    if (ids.ubereats) byPlatform.set(`ubereats:${ids.ubereats}`, r);
  }

  const usedSlugs = new Set(existing.map((r) => r.slug));
  let restaurants = 0;
  let menuItems = 0;
  let scrapes = 0;
  let snapshots = 0;
  const capturedAt = new Date();
  capturedAt.setMinutes(0, 0, 0);

  let i = 0;
  for (const store of stores) {
    i += 1;
    tick('apify-upsert', i, stores.length);
    const platKey = `${store.platformSlug}:${store.storeId}`;
    let rest = byPlatform.get(platKey);
    if (!rest) rest = byKey.get(matchKey(store.name, store.address));

    const sample = pickSample(store.items);
    const cuisine = store.cuisine.length > 0 ? store.cuisine : ['American'];
    const dietary = [...new Set(store.items.flatMap((it) => it.dietary))].slice(0, 6);

    if (!rest) {
      let slug = slugify(store.name) || `store-${store.storeId.slice(0, 8)}`;
      if (usedSlugs.has(slug)) slug = `${slug}-${store.zip}-${store.storeId.slice(0, 6)}`;
      usedSlugs.add(slug);
      const created = await RestaurantModel.create({
        slug,
        name: store.name,
        address: store.address,
        cuisine,
        dietaryTags: dietary,
        rating: store.rating || 4,
        ratingCount: store.ratingCount,
        priceTier: store.priceTier,
        location: { zip: store.zip, geo: { lat: store.lat, lng: store.lng } },
        platformIds: { [store.platformSlug]: store.storeId },
        sampleItem: sample,
        imageUrl: store.imageUrl,
        source: `apify-${store.platformSlug}`,
        phone: store.phone,
      });
      rest = { _id: created._id, name: store.name, address: store.address, platformIds: created.platformIds, slug } as (typeof existing)[number];
      byKey.set(matchKey(store.name, store.address), rest!);
      byPlatform.set(platKey, rest!);
      restaurants += 1;
    } else {
      await RestaurantModel.updateOne(
        { _id: rest._id },
        {
          $set: {
            [`platformIds.${store.platformSlug}`]: store.storeId,
            rating: store.rating || undefined,
            ratingCount: store.ratingCount || undefined,
            imageUrl: store.imageUrl,
            phone: store.phone,
            sampleItem: sample,
          },
          $addToSet: { cuisine: { $each: cuisine } },
        },
      );
      restaurants += 1;
    }

    const restaurantId = rest!._id;
    const menuOps = store.items
      .filter((it) => it.price && it.price > 0)
      .map((it) => ({
        updateOne: {
          filter: { restaurantId, name: it.name },
          update: {
            $set: {
              restaurantId,
              name: it.name,
              description: it.description,
              category: it.category,
              cuisine: cuisine[0],
              basePrice: it.price,
              [`platformPrices.${store.platformSlug}`]: it.price,
              dietaryTags: it.dietary,
              available: true,
              synthetic: false,
              observedPlatform: store.platformSlug,
            },
          },
          upsert: true,
        },
      }));
    if (menuOps.length > 0) menuItems += await bulkUpsert(MenuItemModel as never, menuOps, `menu:${store.storeId}`);

    await PlatformScrapeModel.create({
      platformSlug: store.platformSlug,
      storeId: store.storeId,
      zip: store.zip,
      name: store.name,
      url: store.url,
      actor: ACTORS[store.platformSlug === 'doordash' ? 'doordash' : 'ubereats'],
      runId: store.platformSlug === 'doordash' ? opts?.doordashRunId : opts?.ubereatsRunId,
      capturedAt,
      ...packPayload(store.payload),
    });
    scrapes += 1;

    const subtotal = sample.menuPrice;
    const deliveryFee = store.deliveryFee;
    const serviceFee = round2(subtotal * 0.12);
    const tax = round2(subtotal * 0.07);
    const total = round2(subtotal + deliveryFee + serviceFee + tax);
    await OfferModel.create({
      restaurantId,
      platformSlug: store.platformSlug,
      platformRestaurantId: store.storeId,
      subtotal,
      serviceFee,
      deliveryFee,
      smallOrderFee: 0,
      tax,
      total,
      etaMin: store.etaMin,
      etaMax: store.etaMin + 10,
      fetchedAt: capturedAt,
      deepLink: store.url,
      representativeItem: { name: sample.name, price: sample.menuPrice },
    });
    try {
      await PriceSnapshotModel.create({
        restaurantId,
        platformSlug: store.platformSlug,
        total,
        deliveryFee,
        etaMin: store.etaMin,
        promoApplied: deliveryFee === 0,
        capturedAt,
        source: store.platformSlug === 'doordash' ? 'apify-doordash' : 'apify-ubereats',
      });
      snapshots += 1;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 11000) throw err;
    }
  }

  done('apify', `${restaurants} restaurant upserts, ${menuItems} menu rows, ${scrapes} raw scrapes, ${snapshots} snapshots`);
  return { restaurants, menuItems, scrapes, snapshots };
}
