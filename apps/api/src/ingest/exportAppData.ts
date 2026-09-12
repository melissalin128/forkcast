/**
 * Bundled app dataset, so both apps show every real restaurant with no backend
 * (Vercel static deploy, native builds).
 *
 *   cd apps/api && npx tsx src/ingest/exportAppData.ts
 *
 * READ-ONLY against MongoDB. Offers come from the same code as the API
 * (priceRestaurant + clientCard) with ADAPTER=mock, and getOffer() persists
 * into a throwaway MemoryRepository — never Mongo. Writes, identically, to
 * apps/{mobile,web}/src/data/generated/{restaurants,menus}.json + README.md.
 * Output is byte-identical across runs except generatedAt. The run ends with
 * its own hard checks (Atlas counts unchanged, mock adapter, client guard, money, exact prices).
 */
process.env.ADAPTER = 'mock'; // before anything loads config; dotenv never overrides a set var
process.env.TZ = 'America/New_York'; // the mock fee curves read local hours

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import type { PlatformSlug } from '../models/types';

/**
 * Menu items kept per restaurant in menus.json, chosen by measurement (2026-09-12, 64,278 items):
 * cap 100 -> 3.4 MB, 120 -> 3.8 MB (51k items, 473/655 menus complete), 150 -> 4.1 MB, uncapped 4.8 MB.
 */
const CAP = 120;
/** Items inlined as restaurants[].menu so Home stays light. */
const PREVIEW = 3;
/** The app's default ZIP; distanceMi is measured from its centroid. */
const ORIGIN_ZIP = '15213';
const TIP = 0.15;
/** Pinned "now" for the mock fee curves and promo windows (Sat 2pm ET, when the scrape ran), so re-runs match. */
const PRICED_AT = new Date('2026-09-12T18:00:00.000Z');
const WATCHED = ['offers', 'priceSnapshots', 'restaurants', 'menuItems'];
const APPS = ['mobile', 'web'];

interface ClientMenuItem {
  name: string;
  price: number;
  prices: Partial<Record<PlatformSlug, number>>;
}

/** Uber Eats priceTagline ("$7.38 • 540 Cal.", "Sold out • $4.50") -> dollars; undefined unless positive ("Priced by add-ons"). */
const taglinePrice = (t: unknown): number | undefined => {
  const m = /(-?)\$([\d,]+(?:\.\d+)?)/.exec(String(t ?? ''));
  const n = m ? Number(m[1] + m[2].replace(/,/g, '')) : NaN;
  return n > 0 ? n : undefined;
};

async function main(): Promise<void> {
  mongoose.set('autoIndex', false); // no index builds or collection creates on Atlas
  mongoose.set('autoCreate', false);
  const [{ config }, { adapterMode, getAdapters, MockAdapter }, { MemoryRepository, MongoRepository }, { dollars }, { MenuItemModel, PlatformScrapeModel, RestaurantModel, PLATFORM_SLUGS, unpackPayload }, { priceRestaurant }, { clientCard }] =
    await Promise.all([
      import('../config'),
      import('../adapters'),
      import('../repo'),
      import('../repo/mongo'),
      import('../models'),
      import('../services/offers'),
      import('../routes/restaurants'),
    ]);

  // Check 2: pricing can only ever reach the deterministic mock, never Playwright.
  assert.equal(config.adapter, 'mock');
  assert.equal(adapterMode(), 'mock');
  assert.ok(Object.values(getAdapters()).every((a) => a instanceof MockAdapter), 'getAdapters() is not the mock');
  assert.deepEqual(['$7.38 • 540 Cal.', 'Sold out • $0.55', '$9.99, discounted from $12.99', '$1,020.00', 'Priced by add-ons', '-$2.00'].map(taglinePrice), [7.38, 0.55, 9.99, 1020, undefined, undefined]);
  if (!config.mongodbUri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(config.mongodbUri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 12000 });
  const db = mongoose.connection.db!;
  const counts = async () => Object.fromEntries(await Promise.all(WATCHED.map(async (n) => [n, await db.collection(n).countDocuments()] as const)));
  const before = await counts();

  // ---- reads only ----
  const mongo = new MongoRepository();
  const [stored, platforms, promos, provenance, menuDocs] = await Promise.all([
    mongo.listRestaurants(), // toRestaurant() already applies dollars() to sampleItem.menuPrice
    mongo.listPlatforms(),
    mongo.listActivePromos(PRICED_AT),
    RestaurantModel.find({}, { derivedFields: 1 }).lean(),
    // _id order = scraped listing order (the platform's own menu order, popular section first)
    MenuItemModel.find({ synthetic: false }, { restaurantId: 1, name: 1, basePrice: 1, platformPrices: 1, observedPlatform: 1 }).sort({ _id: 1 }).lean(),
  ]);

  // ---- exact prices from the raw Apify payloads, streamed one store at a time ----
  // Stored prices went through ingest parseMoney(), which left integer cents <= 1000 undivided;
  // dollars() repairs those >= $1.00 but cannot tell 55 (cents) from $55. The payload can.
  // `${platform}:${storeId}` -> item name -> every positive dollar price that store lists under it.
  const listed = new Map<string, Map<string, Set<number>>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Node = Record<string, any>;
  const scrapes = PlatformScrapeModel.find({ platformSlug: { $in: ['doordash', 'ubereats'] } }, { platformSlug: 1, storeId: 1, payload: 1, payloadEncoding: 1 }).lean().cursor();
  for await (const doc of scrapes) {
    const p = unpackPayload(doc) as Node;
    // The ingest's own item paths (apifyPlatforms.ts); the featured lists repeat menu items.
    const nodes: Array<[unknown, number]> =
      doc.platformSlug === 'doordash'
        ? [...(p.menu_categories ?? []).flatMap((c: Node) => c?.items ?? []), ...(p.featured_items?.items ?? [])].map((it: Node) => [it?.name, it?.price_cents / 100])
        : [...(p.menu ?? []).flatMap((c: Node) => c?.catalogItems ?? []), ...(p.featuredItems ?? [])].map((it: Node) => [it?.title, taglinePrice(it?.priceTagline) ?? it?.price / 100]);
    const byName = new Map<string, Set<number>>();
    for (const [raw, price] of nodes) {
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (name && price > 0) byName.set(name, (byName.get(name) ?? new Set<number>()).add(Math.round(price * 100) / 100)); // the ingest skipped the rest too
    }
    listed.set(`${doc.platformSlug}:${doc.storeId}`, byName);
  }
  const stores = (r: { platformIds: Partial<Record<PlatformSlug, string>> }, only?: PlatformSlug) =>
    PLATFORM_SLUGS.filter((p) => r.platformIds[p] && (!only || p === only)).map((p) => `${p}:${r.platformIds[p]}`);
  const payloadPrices = (keys: string[], name: string) => new Set(keys.flatMap((k) => [...(listed.get(k)?.get(name) ?? [])]));
  const priceCounts: Record<string, { matched: number; wrongBefore: number; conflicting: number; unmatched: number }> = {};
  /**
   * The payload price when `name` has exactly one across `keys`. With several (Saga "yum yum sauce" $7.99 and $0.49),
   * the one line the stored `raw` came from: ingest parseMoney() kept cents <= 1000 as-is (raw = price x 100) and
   * divided larger ones (raw = price). Otherwise the dollars()-repaired value.
   */
  const exact = (bucket: string, keys: string[], name: string, repaired: number, raw?: number): number => {
    const found = payloadPrices(keys, name);
    const c = (priceCounts[bucket] ??= { matched: 0, wrongBefore: 0, conflicting: 0, unmatched: 0 });
    if (found.size !== 1) {
      c[found.size ? 'conflicting' : 'unmatched'] += 1;
      const kept = raw === undefined ? [] : [...found].filter((p) => Math.abs(p * 100 - raw) <= 0.5 || Math.abs(p - raw) < 0.005);
      return kept.length === 1 ? kept[0] : repaired;
    }
    const [price] = found;
    c.matched += 1;
    if (Math.abs(price - repaired) >= 0.005) c.wrongBefore += 1;
    return price;
  };
  // sampleItem prices every offer, so it is made exact BEFORE pricing. It carries no platform, so it is
  // looked up across all the restaurant's stores (a DoorDash and an Uber Eats price that differ = conflicting).
  const all = stored.map((r) => ({ ...r, sampleItem: { ...r.sampleItem, menuPrice: exact('sampleItem', stores(r), r.sampleItem.name, r.sampleItem.menuPrice) } }));

  // A $0 sampleItem cannot be priced: the mock would quote a fees-only total and rank it cheapest.
  const unpriceable = all.filter((r) => !(r.sampleItem.menuPrice > 0));
  const restaurants = all
    .filter((r) => r.sampleItem.menuPrice > 0)
    .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : 1));

  const derived = new Map(provenance.map((d) => [String(d._id), (d.derivedFields ?? []) as string[]]));
  const exported = new Map(restaurants.map((r) => [r.id, r]));
  const menuById = new Map<string, ClientMenuItem[]>();
  for (const d of menuDocs) {
    const r = exported.get(String(d.restaurantId));
    if (!r) continue;
    const pp = (d.platformPrices ?? {}) as Partial<Record<PlatformSlug, unknown>>;
    const prices: ClientMenuItem['prices'] = Object.fromEntries(
      PLATFORM_SLUGS.filter((p) => typeof pp[p] === 'number').map((p) => [p, exact(p, stores(r, p), d.name, dollars(pp[p]), pp[p] as number)]),
    );
    // basePrice is platformPrices[observedPlatform] (the ingest sets both in one $set; measured 0 differ), so reuse that exact value.
    const item: ClientMenuItem = { name: d.name, price: prices[d.observedPlatform as PlatformSlug] ?? dollars(d.basePrice), prices };
    const list = menuById.get(r.id) ?? [];
    list.push(item);
    menuById.set(r.id, list);
  }

  // ---- price in memory, through the API's own code ----
  const ctx = { repo: new MemoryRepository(), platforms, promos, subscriptions: [], zip: ORIGIN_ZIP, tipPct: TIP, now: PRICED_AT };
  const menus: Record<string, { total: number; items: ClientMenuItem[] }> = {};
  const cards = [];
  for (const r of restaurants) {
    const card = clientCard(r, await priceRestaurant(ctx, r), ORIGIN_ZIP, TIP);
    const items = menuById.get(r.id) ?? [];
    menus[r.id] = { total: items.length, items: items.slice(0, CAP) };
    cards.push({
      ...card,
      // No observed menu -> keep clientCard's one-item sampleItem menu (modelled prices).
      ...(items.length ? { menu: items.slice(0, PREVIEW) } : {}),
      modelled: [...new Set(['offers', ...(items.length ? [] : ['menu']), ...(derived.get(r.id) ?? [])])].sort(),
    });
  }

  // ---- write: one record per line keeps git diffs readable ----
  const J = JSON.stringify;
  const generatedAt = new Date().toISOString();
  const zips = [...new Set(cards.map((c) => c.location.zip))].sort();
  const restaurantsJson = `{"generatedAt":${J(generatedAt)},"pricedAt":${J(PRICED_AT.toISOString())},"count":${cards.length},"zips":${J(zips)},"restaurants":[\n${cards.map((c) => J(c)).join(',\n')}\n]}\n`;
  const menusJson = `{"generatedAt":${J(generatedAt)},"cap":${CAP},"menus":{\n${cards.map((c) => `${J(c.id)}:${J(menus[c.id])}`).join(',\n')}\n}}\n`;
  const readme = `# Generated data — do not hand-edit

\`restaurants.json\` and \`menus.json\` are generated by

    cd apps/api && npx tsx src/ingest/exportAppData.ts

from the \`forkcast\` MongoDB database (read-only) and written identically to
apps/mobile/src/data/generated and apps/web/src/data/generated. Edits are lost
on the next export; change the exporter instead.

- Generated at: ${generatedAt}
- Restaurants: ${cards.length} (${unpriceable.length} skipped: no sampleItem price, so they cannot be priced)
- Prices as of: ${PRICED_AT.toISOString()} (pinned, so re-runs differ only in generatedAt)

Observed vs modelled:

- Names, cuisine, location, \`imageUrl\` (the platform listing photo) and every
  menu price are observed. A menu price, per-platform price or sampleItem price
  is the store's own listing in the raw Apify payload (platformScrapes: DoorDash
  \`price_cents\`, Uber Eats \`priceTagline\`) whenever that item name is listed
  there at exactly one price, or, when it is listed at several, the listing the
  stored value was parsed from. Otherwise (name not listed, or no single listing
  matches) it is the stored value repaired to dollars with dollars() in
  apps/api/src/repo/mongo.ts.
- \`offers[]\` (every fee, ETA and total) is MODELLED by the mock adapter,
  through the API's own priceRestaurant() + clientCard(): 15% tip, no
  subscriptions, the database's promos active at the pricing time.
- Each restaurant's \`modelled\` array names what is not observed: \`offers\`,
  its derivedFields (e.g. rating / priceTier / sampleItem on WPRDC rows), and
  \`menu\` when there is no observed menu (then \`menu\` is the one sampleItem).
- \`distanceMi\` is straight-line miles from the ${ORIGIN_ZIP} ZIP centroid (the
  app's default ZIP), not from the user.
- \`restaurants[].menu\` is a ${PREVIEW}-item preview. \`menus.json\` holds up to
  \`cap\` (${CAP}) items per restaurant in scraped listing order; \`total\` is
  every observed item, so the UI can say "showing N of M".
`;
  for (const app of APPS) {
    const dir = path.resolve(__dirname, '../../..', app, 'src/data/generated');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'restaurants.json'), restaurantsJson);
    fs.writeFileSync(path.join(dir, 'menus.json'), menusJson);
    fs.writeFileSync(path.join(dir, 'README.md'), readme);
  }

  const after = await counts();
  await mongoose.disconnect();

  // ---- checks, on what was written ----
  const out = JSON.parse(restaurantsJson) as { restaurants: Array<Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const outMenus = (JSON.parse(menusJson) as { menus: typeof menus }).menus;
  // Check 3: the client's isRestaurant guard (src/api/client.ts in both apps).
  const isRestaurant = (v: Record<string, unknown>) => typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.offers);
  assert.ok(out.restaurants.every(isRestaurant), 'a restaurant fails the client isRestaurant guard');
  const photos = out.restaurants.map((r) => r.imageUrl as string | undefined).filter(Boolean);

  // Check 4: money. >= $1000 can only be unrepaired cents.
  const money: Record<string, Array<[number, string]>> = { menuPrice: [], platformPrice: [], sampleItem: [], offerSubtotal: [], offerTotal: [] };
  for (const r of out.restaurants) {
    money.sampleItem.push([r.sampleItem.menuPrice, `${r.name} / ${r.sampleItem.name}`]);
    for (const o of r.offers) {
      money.offerSubtotal.push([o.subtotal, `${r.name} / ${o.platformSlug}`]);
      money.offerTotal.push([o.total, `${r.name} / ${o.platformSlug}`]);
    }
    for (const m of [...outMenus[r.id].items, ...(r.menu as ClientMenuItem[])]) {
      money.menuPrice.push([m.price, `${r.name} / ${m.name}`]);
      for (const p of Object.values(m.prices)) money.platformPrice.push([p as number, `${r.name} / ${m.name}`]);
    }
  }
  const range = Object.fromEntries(
    Object.entries(money).map(([k, rows]) => {
      const v = rows.map(([n]) => n);
      assert.ok(v.every((n) => Number.isFinite(n) && n >= 0 && n < 1000), `${k} has a non-finite, negative or >= $1000 value`);
      return [k, { min: Math.min(...v), max: Math.max(...v) }];
    }),
  );
  // Check 5: every written price whose name the payload lists at ONE price now equals it; with several, it is one of them.
  const wrongAfter: Record<string, number> = {};
  const recheck = (bucket: string, keys: string[], name: string, v: number) => {
    const found = payloadPrices(keys, name);
    wrongAfter[bucket] = (wrongAfter[bucket] ?? 0) + (found.size && ![...found].some((p) => Math.abs(p - v) < 0.005) ? 1 : 0);
  };
  for (const r of out.restaurants) {
    recheck('sampleItem', stores({ platformIds: r.platformIds }), r.sampleItem.name, r.sampleItem.menuPrice);
    for (const m of outMenus[r.id].items) for (const p of Object.keys(m.prices) as PlatformSlug[]) recheck(p, stores({ platformIds: r.platformIds }, p), m.name, m.prices[p]!);
  }
  const outliers = [...new Map([...money.menuPrice, ...money.platformPrice, ...money.sampleItem].filter(([n]) => n < 0.5 || n > 300).map(([n, l]) => [`${n} ${l}`, 0])).keys()].sort();
  const spot = out.restaurants
    .filter((r) => /kung fu tea|cheesecake factory/i.test(r.name))
    .map((r) => ({ name: r.name, sampleItem: r.sampleItem, menu: r.menu, total: outMenus[r.id].total, best: r.best }));

  const report = {
    before,
    after,
    adapter: adapterMode(),
    restaurantsInDb: all.length,
    exported: out.restaurants.length,
    skippedUnpriceable: unpriceable.length,
    withOffers: out.restaurants.filter((r) => r.offers.length > 0).length,
    withUnavailable: out.restaurants.filter((r) => r.unavailable.length > 0).length,
    distanceNull: out.restaurants.filter((r) => typeof r.distanceMi !== 'number').length,
    withObservedMenu: Object.values(outMenus).filter((m) => m.total > 0).length,
    menuItemsTotal: Object.values(outMenus).reduce((s, m) => s + m.total, 0),
    menuItemsKept: Object.values(outMenus).reduce((s, m) => s + m.items.length, 0),
    imageUrl: photos.length,
    distinctImageUrl: new Set(photos).size,
    activePromos: promos.map((p) => p.code),
    bytes: { restaurants: Buffer.byteLength(restaurantsJson), menus: Buffer.byteLength(menusJson) },
    payloadStores: listed.size,
    exactPrices: priceCounts, // every exported restaurant's items, before the cap; wrongBefore = dollars() value != payload
    wrongAfter, // written items (menus.json) and sampleItems
    range,
    outliers,
    spot,
  };
  console.log(JSON.stringify(report, null, 2));
  // Check 1: nothing in Atlas changed while this ran.
  assert.deepEqual(after, before, 'Atlas document counts changed during the export');
  assert.ok(Object.values(wrongAfter).every((n) => n === 0), 'a written price differs from its unambiguous payload price');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
