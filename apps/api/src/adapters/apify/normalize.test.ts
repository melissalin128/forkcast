/**
 * The normalizer is the part of the Apify path most likely to silently break
 * (an actor renames a field, a price starts arriving in cents), so the fixtures
 * here are three deliberately different actor output shapes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { actorConfig, renderInput } from './actors';
import { addressOf, detectPriceScale, isItemRow, joinFlatRows, normalizeFees, normalizeListing, normalizeMenu, parseCount, pickEta, pickField, pickMoney, pickStoreId, storeIdFromUrl, toMoney, unwrapRows } from './normalize';

// Shape A: flat, camelCase, dollars as numbers.
const FLAT_ROW = {
  id: '1234567',
  name: 'Ramen Bar',
  address: '3703 Forbes Ave, Pittsburgh, PA 15213',
  cuisines: ['Japanese', 'Ramen'],
  rating: 4.62,
  ratingCount: 1840,
  deliveryFee: 2.99,
  deliveryTime: '25-40 min',
  imageUrl: 'https://img.example/ramen.jpg',
  url: 'https://www.doordash.com/store/ramen-bar-1234567/',
  menuItems: [
    { name: 'Tonkotsu Ramen', price: 16.5 },
    { name: 'Gyoza', price: 7.25 },
  ],
};

// Shape B: snake_case, nested, minor units + currency, menu under categories.
const NESTED_ROW = {
  store: { store_id: 'abc-uuid' },
  title: 'Ramen Bar',
  location: { street_address: '3703 Forbes Ave', postal_code: '15213' },
  categories: [{ name: 'Japanese' }, { name: 'Noodles' }],
  reviews_average: '4.6',
  reviews_count: 1840,
  fees: { delivery: { amount: 299, currencyCode: 'USD' }, service: { amount: 199, currencyCode: 'USD' } },
  estimated_delivery_time: 30,
  menu: [{ title: 'Noodles', items: [{ item_name: 'Tonkotsu Ramen', display_price: '$16.50' }] }],
};

// Shape C: no id field at all — only the store URL.
const URL_ONLY_ROW = {
  storeName: 'Ramen Bar',
  webUrl: 'https://www.ubereats.com/store/ramen-bar/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  ratingText: '4.6 (1,840 ratings)',
  deliveryFeeCents: 299,
};

test('normalizeListing reads a flat camelCase row', () => {
  const l = normalizeListing(FLAT_ROW, 'doordash', '15213');
  assert.ok(l);
  assert.equal(l.platformRestaurantId, '1234567');
  assert.equal(l.name, 'Ramen Bar');
  assert.equal(l.address, '3703 Forbes Ave');
  assert.equal(l.zip, '15213');
  assert.deepEqual(l.cuisine, ['Japanese', 'Ramen']);
  assert.equal(l.rating, 4.6);
  assert.equal(l.ratingCount, 1840);
  assert.equal(l.deliveryFee, 2.99);
  assert.deepEqual([l.etaMin, l.etaMax], [25, 40]);
});

test('normalizeListing reads a nested snake_case row with minor units', () => {
  const l = normalizeListing(NESTED_ROW, 'doordash', '15213');
  assert.ok(l);
  assert.equal(l.platformRestaurantId, 'abc-uuid');
  assert.equal(l.address, '3703 Forbes Ave');
  assert.equal(l.zip, '15213');
  assert.deepEqual(l.cuisine, ['Japanese', 'Noodles']);
  assert.equal(l.rating, 4.6);
  assert.equal(l.deliveryFee, 2.99);
  assert.deepEqual([l.etaMin, l.etaMax], [30, 40]);
});

test('normalizeListing falls back to the store id in the URL', () => {
  const l = normalizeListing(URL_ONLY_ROW, 'ubereats', '15213');
  assert.ok(l);
  assert.equal(l.platformRestaurantId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(l.rating, 4.6);
  assert.equal(l.ratingCount, 1840);
  assert.equal(l.deliveryFee, 2.99);
});

test('normalizeListing rejects rows without a name or id', () => {
  assert.equal(normalizeListing({ foo: 'bar' }, 'doordash', '15213'), null);
  assert.equal(normalizeListing({ name: 'No Id Here' }, 'doordash', '15213'), null);
  assert.equal(normalizeListing('nope', 'doordash', '15213'), null);
});

test('normalizeMenu handles flat and nested menus', () => {
  assert.deepEqual(normalizeMenu(FLAT_ROW), [
    { name: 'Tonkotsu Ramen', price: 16.5 },
    { name: 'Gyoza', price: 7.25 },
  ]);
  assert.deepEqual(normalizeMenu(NESTED_ROW), [{ name: 'Tonkotsu Ramen', price: 16.5 }]);
  assert.deepEqual(normalizeMenu(URL_ONLY_ROW), []);
});

test('normalizeFees leaves unreported lines undefined', () => {
  const flat = normalizeFees(FLAT_ROW);
  assert.equal(flat.deliveryFee, 2.99);
  assert.equal(flat.serviceFee, undefined);
  assert.equal(flat.tax, undefined);

  const nested = normalizeFees(NESTED_ROW);
  assert.equal(nested.deliveryFee, 2.99);
  assert.equal(nested.serviceFee, 1.99);
});

test('normalizeFees picks up promo copy', () => {
  const fees = normalizeFees({ ...FLAT_ROW, offerText: '20% off orders $25+' });
  assert.equal(fees.promoText, '20% off orders $25+');
});

test('toMoney covers the shapes actors emit', () => {
  assert.equal(toMoney(2.99), 2.99);
  assert.equal(toMoney('$2.99'), 2.99);
  assert.equal(toMoney('Free'), 0);
  assert.equal(toMoney({ amount: 299, currencyCode: 'USD' }), 2.99);
  assert.equal(toMoney({ amount: 2.99 }), 2.99);
  assert.equal(toMoney({ displayString: '$2.99' }), 2.99);
  assert.equal(toMoney({ unitAmount: 1650, currency: 'USD' }), 16.5);
  assert.equal(toMoney(undefined), undefined);
  // A bare integer is dollars: a $5 delivery fee must not become $0.05.
  assert.equal(toMoney(5), 5);
});

test('pickMoney treats *Cents keys as minor units', () => {
  assert.equal(pickMoney({ deliveryFeeCents: 299 }, ['deliveryFee']), 2.99);
  assert.equal(pickMoney({ deliveryFee: 2.99 }, ['deliveryFee']), 2.99);
});

test('pickField prefers shallow keys and matches without case or punctuation', () => {
  assert.equal(pickField({ delivery_fee: 1, nested: { deliveryFee: 2 } }, ['deliveryFee']), 1);
  assert.equal(pickField({ nested: { deep: { deliveryFee: 3 } } }, ['deliveryFee']), 3);
  assert.equal(pickField({ a: { b: { c: { d: { deliveryFee: 4 } } } } }, ['deliveryFee'], 2), undefined);
});

test('pickField resolves depth first, then alias order — not JSON key order', () => {
  // `slug` is listed first in the object but last in the aliases: storeId still wins.
  assert.equal(pickField({ slug: 'a-slug', storeId: 'S1' }, ['storeId', 'id', 'slug']), 'S1');
  // A deeper high-priority alias must never outrank a shallow low-priority one:
  // a menu item's `uuid` cannot become the store id.
  const row = { slug: 'ottimo-pizza', menu: [{ catalogItems: [{ uuid: 'item-uuid' }] }] };
  assert.equal(pickStoreId(row, 'ubereats'), 'ottimo-pizza');
});

test('pickEta reads ranges, pairs and single values', () => {
  assert.deepEqual(pickEta({ eta: '25-40 min' }), { etaMin: 25, etaMax: 40 });
  assert.deepEqual(pickEta({ minDeliveryTime: 20, maxDeliveryTime: 35 }), { etaMin: 20, etaMax: 35 });
  assert.deepEqual(pickEta({ deliveryTime: 30 }), { etaMin: 30, etaMax: 40 });
  assert.deepEqual(pickEta({ nothing: true }), {});
});

test('storeIdFromUrl knows each platform URL shape', () => {
  assert.equal(storeIdFromUrl('https://www.doordash.com/store/ramen-bar-1234567/', 'doordash'), '1234567');
  assert.equal(storeIdFromUrl('https://www.ubereats.com/store/x/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'ubereats'), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(storeIdFromUrl('https://www.grubhub.com/restaurant/ramen-bar-forbes-ave-pittsburgh/987654', 'grubhub'), 'ramen-bar-forbes-ave-pittsburgh');
});

test('addressOf splits a one-line address and finds the zip', () => {
  assert.deepEqual(addressOf({ address: '3703 Forbes Ave, Pittsburgh, PA 15213' }), { street: '3703 Forbes Ave', zip: '15213' });
  assert.deepEqual(addressOf({ address: { address1: '100 Main St', zipCode: '15232' } }), { street: '100 Main St', zip: '15232' });
  assert.deepEqual(addressOf({}), {});
});

test('unwrapRows flattens wrapped datasets', () => {
  assert.equal(unwrapRows([{ results: [{ name: 'a' }, { name: 'b' }] }]).length, 2);
  assert.equal(unwrapRows([{ name: 'a' }, { name: 'b' }]).length, 2);
  assert.equal(unwrapRows(['nope', null]).length, 0);
});

// ---------------------------------------------------------------------------
// Flat datasets (solidcode/ubereats-full-menu-scraper's documented shape)
// ---------------------------------------------------------------------------

const UE_STORE_ROW = {
  recordType: 'store',
  storeId: '1a06a2b8-6aca-4c05-89f9-2d9d1e4f4415',
  storeSlug: 'antons-falafel-house',
  storeUrl: 'https://www.ubereats.com/store/antons-falafel-house/GgaiuGrKTAWJ-S2dHk9EFQ?diningMode=DELIVERY',
  name: "Anton's Falafel House",
  storeType: 'Restaurant',
  rating: 4.7,
  reviewCount: 600,
  cuisines: ['Mediterranean', 'Middle Eastern'],
  address: { street: '1901 Ocean Ave', city: 'San Francisco', region: 'CA', postalCode: '94127', country: 'US' },
  addressText: '1901 Ocean Ave, San Francisco, CA 94127',
  deliveryEtaMinutes: { min: 20, max: 35 },
  deliveryFee: '$0.49 Delivery Fee',
  imageUrl: 'https://tb-static.uber.com/prod/hero.jpeg',
  currencyCode: 'USD',
  menuItemCount: 31,
};

const UE_ITEM_ROW = {
  recordType: 'menuItem',
  storeId: '1a06a2b8-6aca-4c05-89f9-2d9d1e4f4415',
  storeName: "Anton's Falafel House",
  storeUrl: 'https://www.ubereats.com/store/antons-falafel-house/GgaiuGrKTAWJ-S2dHk9EFQ?diningMode=DELIVERY',
  itemId: '8d31c7f0-51ae-4a6c-b2f8-c0a1e2b39d44',
  name: 'Chicken Shawarma Plate',
  sectionName: 'Main Menu',
  price: 16.95,
  priceFormatted: '$16.95',
  currencyCode: 'USD',
  isAvailable: true,
};

test('unwrapRows folds flat menuItem rows into their store row', () => {
  const rows = unwrapRows([UE_STORE_ROW, UE_ITEM_ROW, { ...UE_ITEM_ROW, itemId: 'b', name: 'Falafel Wrap', price: 12.5, priceFormatted: '$12.50' }]);
  assert.equal(rows.length, 1, 'menu items must not become their own restaurants');
  assert.deepEqual(normalizeMenu(rows[0]), [
    { name: 'Chicken Shawarma Plate', price: 16.95 },
    { name: 'Falafel Wrap', price: 12.5 },
  ]);
});

test('a flat store row normalizes with its fee, eta and address', () => {
  const [row] = unwrapRows([UE_STORE_ROW, UE_ITEM_ROW]);
  const l = normalizeListing(row, 'ubereats', '15213');
  assert.ok(l);
  assert.equal(l.platformRestaurantId, '1a06a2b8-6aca-4c05-89f9-2d9d1e4f4415');
  assert.equal(l.name, "Anton's Falafel House");
  assert.equal(l.address, '1901 Ocean Ave');
  assert.equal(l.zip, '94127');
  assert.equal(l.rating, 4.7);
  assert.equal(l.ratingCount, 600);
  assert.deepEqual(l.cuisine, ['Mediterranean', 'Middle Eastern']);
  assert.equal(l.url, UE_STORE_ROW.storeUrl);
  // "$0.49 Delivery Fee" is a badge string, not a number.
  assert.equal(normalizeFees(row).deliveryFee, 0.49);
  assert.deepEqual([l.etaMin, l.etaMax], [20, 35]);
});

test('item rows join to their store by URL when ids differ, and by path when the query string differs', () => {
  const store = { recordType: 'store', name: 'No Id Co', storeUrl: 'https://www.ubereats.com/store/no-id-co/xyz' };
  const item = { recordType: 'menuItem', storeUrl: 'https://www.ubereats.com/store/no-id-co/xyz?diningMode=DELIVERY', name: 'Bowl', price: 9 };
  const rows = unwrapRows([store, item]);
  assert.equal(rows.length, 1);
  assert.deepEqual(normalizeMenu(rows[0]), [{ name: 'Bowl', price: 9 }]);
});

test('item rows with no store row of their own become one store', () => {
  const rows = unwrapRows([UE_ITEM_ROW, { ...UE_ITEM_ROW, itemId: 'b', name: 'Falafel Wrap', price: 12.5 }]);
  assert.equal(rows.length, 1);
  const l = normalizeListing(rows[0], 'ubereats', '15213');
  assert.equal(l?.name, "Anton's Falafel House", 'named after the store, not the first dish');
  assert.equal(normalizeMenu(rows[0]).length, 2);
});

test('isItemRow spots item rows without a recordType tag', () => {
  assert.equal(isItemRow({ storeId: 'x', name: 'Bowl', price: 9 }), true);
  assert.equal(isItemRow({ storeId: 'x', name: 'Store', rating: 4.5, address: 'a' }), false);
  // A one-row-per-store dataset that happens to carry a price stays a store.
  assert.equal(isItemRow({ id: 'x', name: 'Store', price: 9 }), false);
});

test('one-row-per-store datasets pass through joinFlatRows untouched', () => {
  assert.deepEqual(joinFlatRows([FLAT_ROW as never, NESTED_ROW as never]), [FLAT_ROW, NESTED_ROW]);
});

// ---------------------------------------------------------------------------
// Real capture: an Uber Eats actor that passes Uber's own catalog vocabulary
// through — sections under `catalogItems`, prices in cents, rating as an object.
// ---------------------------------------------------------------------------

const CATALOG_ROW = JSON.parse(readFileSync(new URL('./fixtures/ubereats-catalog.json', import.meta.url), 'utf8')) as Record<string, unknown>;

test('catalog-shaped row: store fields', () => {
  const l = normalizeListing(CATALOG_ROW, 'ubereats', '15213');
  assert.ok(l);
  assert.equal(l.name, 'Ottimo Pizza & Pasta (4635 Centre Avenue)');
  assert.equal(l.platformRestaurantId, 'ottimo-pizza-&-pasta-4635-centre-avenue');
  assert.equal(l.address, '4635 Centre Avenue');
  assert.equal(l.zip, '15213');
  // rating is an object: {ratingValue: 4.5, ratingCount: "140+"}
  assert.equal(l.rating, 4.5);
  assert.equal(l.ratingCount, 140);
  // categories leads with the "$" price bucket, which is not a cuisine
  assert.deepEqual(l.cuisine, ['Pizza', 'American', 'Italian']);
  assert.deepEqual([l.etaMin, l.etaMax], [31, 52]);
  // "fareBadge": " $0 delivery fee (new users)"
  assert.equal(l.deliveryFee, 0);
});

test('catalog-shaped row: menu items are found and priced in dollars, not cents', () => {
  const menu = normalizeMenu(CATALOG_ROW);
  assert.equal(menu.length, 6, 'items live under menu[].catalogItems[]');
  assert.deepEqual(menu[0], { name: '16" Large Traditional Cheese Pizza', price: 17.99 });
  assert.deepEqual(menu[menu.length - 1], { name: 'Garlic Bread', price: 2.59 });
  // The float artifacts Uber's cent maths leaves behind (5037.200000000001).
  assert.equal(menu.find((m) => m.name === 'Party Special')?.price, 50.37);
  assert.equal(menu.find((m) => m.name === 'Greek Gourmet Pizza')?.price, 12.59);
  assert.ok(menu.every((m) => m.price < 100), 'no item may keep its cents value');
  // Section names ("Offers", "Appetizers and Finger Foods") are not dishes.
  assert.equal(menu.some((m) => m.name === 'Offers'), false);
});

test('catalog-shaped row: an item-level promo is not read as an order promo', () => {
  // "Buy 1, get 1 free" applies to one dish, not the basket; `promotions` is the store-level field.
  assert.equal(normalizeFees(CATALOG_ROW).promoText, undefined);
});

test('detectPriceScale settles cents from a number/string pair, else from the spread', () => {
  const paired = [{ name: 'a', price: 17.99, fromText: true, raw: 1799 }];
  assert.equal(detectPriceScale(paired), 100);
  assert.equal(detectPriceScale([{ name: 'a', price: 17.99, fromText: true, raw: 17.99 }]), 1);
  // No formatted strings anywhere: every price >= 100 with something >= 1000 is cents.
  assert.equal(detectPriceScale([{ name: 'a', price: 999, fromText: false }, { name: 'b', price: 1799, fromText: false }, { name: 'c', price: 259, fromText: false }]), 100);
  // A plausible dollar menu is left alone.
  assert.equal(detectPriceScale([{ name: 'a', price: 9.99, fromText: false }, { name: 'b', price: 17.99, fromText: false }, { name: 'c', price: 2.59, fromText: false }]), 1);
});

test('parseCount reads display counts', () => {
  assert.equal(parseCount('140+'), 140);
  assert.equal(parseCount('1,840'), 1840);
  assert.equal(parseCount('2k+'), 2000);
  assert.equal(parseCount(600), 600);
  assert.equal(parseCount(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Input templates
// ---------------------------------------------------------------------------

test('renderInput substitutes placeholders and keeps types', () => {
  const out = renderInput(
    { search: '{{query}}', location: '{{address}}', maxItems: '{{limit}}' as unknown as never, note: 'find {{query}} near {{zip}}' },
    { query: 'ramen', address: 'Pittsburgh, PA 15213', zip: '15213', limit: 20 },
  );
  assert.deepEqual(out, { search: 'ramen', location: 'Pittsburgh, PA 15213', maxItems: 20, note: 'find ramen near 15213' });
});

test('renderInput drops keys whose placeholder has no value', () => {
  const out = renderInput({ search: '{{query}}', itemName: '{{item}}', nested: { only: '{{item}}' } }, { query: 'ramen' });
  assert.deepEqual(out, { search: 'ramen' });
});

test('renderInput renders nested startUrls', () => {
  const out = renderInput({ startUrls: [{ url: '{{storeUrl}}' }], maxItems: 1 }, { storeUrl: 'https://www.doordash.com/store/1234567/' });
  assert.deepEqual(out, { startUrls: [{ url: 'https://www.doordash.com/store/1234567/' }], maxItems: 1 });
});

test('actorConfig names the env var to set when an actor is missing', () => {
  assert.throws(() => actorConfig('doordash', {}), /APIFY_DOORDASH_ACTOR/);
  const cfg = actorConfig('doordash', { APIFY_DOORDASH_ACTOR: 'someone/doordash-scraper' });
  assert.equal(cfg.searchActor, 'someone/doordash-scraper');
  assert.equal(cfg.storeActor, 'someone/doordash-scraper');
  const split = actorConfig('doordash', { APIFY_DOORDASH_ACTOR: 'a/search', APIFY_DOORDASH_STORE_ACTOR: 'a/store' });
  assert.equal(split.storeActor, 'a/store');
});

test('the built-in ubereats template renders a valid borderline/uber-eats-scraper-ppr input', () => {
  const cfg = actorConfig('ubereats', { APIFY_UBEREATS_ACTOR: 'borderline/uber-eats-scraper-ppr' });
  const search = renderInput(cfg.searchInput, { query: 'pizza', address: 'Pittsburgh, PA 15213', lat: 40.4516, lng: -79.9522, limit: 8 });
  assert.deepEqual(search, {
    query: 'pizza',
    address: 'Pittsburgh, PA 15213',
    latitude: 40.4516,
    longitude: -79.9522,
    addressCountry: 'US',
    locale: 'en-US',
    diningMode: 'DELIVERY',
    storeType: 'RESTAURANTS',
    maxRows: 8,
    getMenuCustomizations: false,
  });
  // No geocode for this zip: the coordinate keys drop out and the address carries the search.
  const noGeo = renderInput(cfg.searchInput, { query: 'pizza', address: '15213', limit: 8 });
  assert.equal('latitude' in noGeo, false);
  assert.equal(noGeo.address, '15213');

  const store = renderInput(cfg.storeInput, { storeUrl: 'https://www.ubereats.com/store/ottimo/abc' });
  assert.deepEqual(store, { urls: ['https://www.ubereats.com/store/ottimo/abc'], locale: 'en-US', diningMode: 'DELIVERY', getMenuCustomizations: false });
});

test('actorConfig rejects malformed input templates', () => {
  assert.throws(() => actorConfig('grubhub', { APIFY_GRUBHUB_ACTOR: 'a/b', APIFY_GRUBHUB_INPUT: 'not json' }), /APIFY_GRUBHUB_INPUT/);
});
