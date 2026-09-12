/**
 * The profile layer: per-actor overrides on top of the generic normalizer.
 * These use a fictional DoorDash actor whose vocabulary collides with the
 * defaults on purpose — that collision is the case profiles exist for.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApifyAdapter } from '../apify';
import type { ApifyClient } from './client';
import { DEFAULT_FIELDS, mergeFields } from './fields';
import { normalizeFees, normalizeListing, normalizeMenu } from './normalize';
import { actorConfig, renderInput } from './actors';
import { BORDERLINE_UBEREATS, DZ_OMAR_DOORDASH, fieldsFor, GENERIC_PROFILE, profileFor, type ApifyProfile } from './profiles';

const ACTORS = { searchActor: 'someone/dd', searchInput: {}, storeActor: 'someone/dd', storeInput: {} };
const stub = (rows: unknown[]): ApifyClient => ({ async run() { return rows; } }) as unknown as ApifyClient;

test('mergeFields prepends overrides and keeps the defaults as fallback', () => {
  const f = mergeFields({ deliveryFee: ['ddFee'] });
  assert.equal(f.deliveryFee[0], 'ddFee');
  assert.ok(f.deliveryFee.includes('deliveryFee'), 'generic names stay available');
  assert.deepEqual(f.name, DEFAULT_FIELDS.name, 'untouched fields are unchanged');
});

test("mergeFields '!' replaces the defaults outright", () => {
  const f = mergeFields({ storeId: ['!', 'ddStoreId'] });
  assert.deepEqual(f.storeId, ['ddStoreId']);
});

test('profileFor: env name wins, then actor id, then generic', () => {
  assert.equal(profileFor('ubereats', 'borderline/uber-eats-scraper-ppr', {}), BORDERLINE_UBEREATS);
  assert.equal(profileFor('doordash', 'someone/unknown-actor', {}), GENERIC_PROFILE);
  assert.equal(profileFor('doordash', 'someone/unknown-actor', { APIFY_DOORDASH_PROFILE: 'generic' }), GENERIC_PROFILE);
  // Matching is case-insensitive on the actor id.
  assert.equal(profileFor('ubereats', 'Borderline/Uber-Eats-Scraper-PPR', {}), BORDERLINE_UBEREATS);
});

test('profileFor names the registered profiles when asked for one that does not exist', () => {
  assert.throws(
    () => profileFor('doordash', 'a/b', { APIFY_DOORDASH_PROFILE: 'nope' }),
    /APIFY_DOORDASH_PROFILE="nope" is not a registered profile.*generic/s,
  );
});

// ---------------------------------------------------------------------------
// A DoorDash actor whose field names collide with the generic vocabulary
// ---------------------------------------------------------------------------

/**
 * `name` here is the *chain* ("Papa Johns"), not the store; `rating` is a count,
 * not a score; and `price` on an item is a price *tier*. Aliases alone would
 * read all three wrongly, so the profile replaces rather than prepends.
 */
const DD_PROFILE: ApifyProfile = {
  name: 'someone/dd',
  fields: {
    name: ['!', 'storeDisplayName'],
    storeId: ['!', 'ddStoreId'],
    rating: ['!', 'starRating'],
    ratingCount: ['!', 'numberOfReviews'],
    deliveryFee: ['!', 'deliveryFeeString'],
    menuContainers: ['!', 'menuBook'],
    itemName: ['!', 'itemTitle'],
    itemPriceNum: ['!', 'unitAmountCents'],
    itemPriceText: ['!', 'displayAmount'],
  },
};

const DD_ROW = {
  name: 'Papa Johns',
  storeDisplayName: 'Papa Johns (Oakland)',
  ddStoreId: '998877',
  rating: 412,
  starRating: 4.3,
  numberOfReviews: 412,
  price: 2,
  deliveryFee: 'varies',
  deliveryFeeString: '$3.49 delivery fee',
  address: '3609 Forbes Ave, Pittsburgh, PA 15213',
  menuBook: [{ sectionTitle: 'Pizzas', menuBook: [{ itemTitle: 'Large Pepperoni', unitAmountCents: 1899, displayAmount: '$18.99' }] }],
};

test('a profile redirects colliding field names', () => {
  // The generic reading fails in exactly the ways the profile exists to fix:
  // it cannot find an id at all, and with only the id fixed it still reads the
  // chain name as the store and the review count as the score.
  assert.equal(normalizeListing(DD_ROW, 'doordash', '15213', DEFAULT_FIELDS), null);
  const idOnly = normalizeListing(DD_ROW, 'doordash', '15213', mergeFields({ storeId: ['!', 'ddStoreId'] }));
  assert.equal(idOnly?.name, 'Papa Johns');
  assert.equal(idOnly?.rating, 412);

  const l = normalizeListing(DD_ROW, 'doordash', '15213', fieldsFor(DD_PROFILE));
  assert.ok(l);
  assert.equal(l.name, 'Papa Johns (Oakland)');
  assert.equal(l.platformRestaurantId, '998877');
  assert.equal(l.rating, 4.3);
  assert.equal(l.ratingCount, 412);
  assert.equal(l.deliveryFee, 3.49);
  assert.equal(l.address, '3609 Forbes Ave');
});

test('a profile redirects the menu vocabulary too', () => {
  assert.deepEqual(normalizeMenu(DD_ROW, DEFAULT_FIELDS), [], 'generic finds nothing under menuBook');
  assert.deepEqual(normalizeMenu(DD_ROW, fieldsFor(DD_PROFILE)), [{ name: 'Large Pepperoni', price: 18.99 }]);
});

test('hooks replace the generic readers when aliases are not enough', async () => {
  const calls: string[] = [];
  const profile: ApifyProfile = {
    name: 'someone/dd',
    rows: (rows) => {
      calls.push('rows');
      return rows.filter((r) => r.kind === 'store');
    },
    listing: (row, ctx) => {
      calls.push('listing');
      return { platformSlug: ctx.platform, platformRestaurantId: String(row.k), name: String(row.n), address: '', zip: ctx.zip, cuisine: [] };
    },
    menu: () => {
      calls.push('menu');
      return [{ name: 'Fixed', price: 9 }];
    },
    fees: () => {
      calls.push('fees');
      return { deliveryFee: 1.5, etaMin: 10, etaMax: 20 };
    },
  };
  const adapter = new ApifyAdapter('doordash', stub([{ kind: 'store', k: 'S1', n: 'Store One' }, { kind: 'junk' }]), ACTORS, profile);

  const listings = await adapter.searchRestaurants('15213', 'pizza');
  assert.equal(listings.length, 1, 'the rows hook dropped the junk row');
  assert.equal(listings[0].name, 'Store One');

  const offer = await adapter.fetchOffer('S1', '15213', [{ name: 'anything', quantity: 1 }]);
  assert.equal(offer.subtotal, 9);
  assert.equal(offer.deliveryFee, 1.5);
  assert.deepEqual([offer.etaMin, offer.etaMax], [10, 20]);
  assert.deepEqual(calls.slice(0, 2), ['rows', 'listing']);
  assert.ok(calls.includes('menu') && calls.includes('fees'));
});

test('a listing hook may decline a row and fall through to the generic reader', async () => {
  const profile: ApifyProfile = { name: 'someone/dd', listing: (row) => (row.skipMe ? null : undefined) };
  const rows = [{ skipMe: true, id: 'x', name: 'Hidden' }, { id: 'S2', name: 'Visible', address: '1 Main St, Pittsburgh, PA 15213' }];
  const listings = await new ApifyAdapter('doordash', stub(rows), ACTORS, profile).searchRestaurants('15213', 'pizza');
  assert.deepEqual(listings.map((l) => l.name), ['Visible']);
});

// ---------------------------------------------------------------------------
// dz_omar/doordash-scraper — fixture captured from a real Pittsburgh 15213 run
// ---------------------------------------------------------------------------

const DD_ROWS = JSON.parse(readFileSync(new URL('./fixtures/doordash-search.json', import.meta.url), 'utf8')) as Record<string, unknown>[];

const ddFields = () => fieldsFor(DZ_OMAR_DOORDASH);

test('doordash store row: identity, cuisines from tags, fee and eta from display fields', () => {
  const l = normalizeListing(DD_ROWS[0], 'doordash', '15213', ddFields());
  assert.ok(l);
  assert.equal(l.platformRestaurantId, '977564', 'store_id, not business.id');
  assert.equal(l.name, "Little Nipper's Pizza II", 'name, not business.name');
  assert.equal(l.url, 'https://www.doordash.com/store/977564');
  assert.equal(l.address, '216 N Craig St');
  assert.equal(l.zip, '15213', 'zip read out of the address string');
  assert.ok(l.cuisine.includes('Pizza') && l.cuisine.includes('Italian'), `tags -> cuisines (got ${l.cuisine.join(', ')})`);
  assert.equal(l.rating, 4.5);
  assert.equal(l.ratingCount, 2025);
  assert.equal(l.imageUrl?.startsWith('https://img.cdn4dd.com/'), true, 'header_image');
  assert.equal(l.deliveryFee, 0, '"$0 delivery fee, first order"');
  assert.deepEqual([l.etaMin, l.etaMax], [30, 40], 'asap_minutes as the minimum');
});

test('doordash menu: display price (discount applied) beats price_cents, sections and wrappers skipped', () => {
  const menu = normalizeMenu(DD_ROWS[0], ddFields());
  const byName = new Map(menu.map((m) => [m.name, m.price]));
  // price_display "$11.47" wins over price_cents 1529 — the display has the store's 25% off applied.
  assert.equal(byName.get('Traditional Pie Pizza (14")'), 11.47);
  assert.equal(byName.get('Marinara Sauce'), 1.61);
  // Category and carousel wrappers never become priceable items themselves.
  assert.equal(byName.has('Most Ordered'), false);
  assert.ok(menu.length >= 6, `categories and featured items both contribute (got ${menu.length})`);
  assert.ok(menu.every((m) => m.price > 0 && m.price < 100), 'no cents-scale leakage');
});

test('doordash fees: no invented service fee or promo, fee straight from the tile string', () => {
  const fees = normalizeFees(DD_ROWS[0], ddFields());
  assert.equal(fees.deliveryFee, 0);
  assert.equal(fees.serviceFee, undefined);
  assert.equal(fees.promoText, undefined, 'item-level "25% off" badges are not a store promo');
});

test('doordash end to end: search rows price offers with no extra runs and no location flag', async () => {
  let runs = 0;
  const client = { async run() { runs += 1; return DD_ROWS; } } as unknown as ApifyClient;
  const adapter = new ApifyAdapter('doordash', client, ACTORS, DZ_OMAR_DOORDASH);
  const listings = await adapter.searchRestaurants('15213', 'pizza');
  assert.deepEqual(listings.map((l) => l.name), ["Little Nipper's Pizza II", 'Pizza Parma']);
  const offer = await adapter.fetchOffer('977564', '15213', [{ name: 'Traditional Pie Pizza (14")', quantity: 1 }]);
  assert.equal(offer.subtotal, 11.47);
  assert.equal(offer.deliveryFee, 0);
  // The actor takes a delivery address, so offers are NOT flagged locationUnverified.
  assert.equal(offer.locationUnverified, undefined);
  assert.equal(runs, 1, 'the search run priced the offer; no store run needed');
});

test('a locationUnverified profile flags every offer', async () => {
  const profile: ApifyProfile = { name: 'someone/no-address', locationUnverified: true };
  const row = { id: 'S1', name: 'Andaluzia', address: '1 Main St, Pittsburgh, PA 15213', deliveryFee: '$3.99 delivery fee', menuItems: [{ name: 'Biriyani', priceText: '$20.99' }] };
  const adapter = new ApifyAdapter('doordash', stub([row]), ACTORS, profile);
  await adapter.searchRestaurants('15213', 'biriyani');
  const offer = await adapter.fetchOffer('S1', '15213', [{ name: 'Biriyani', quantity: 1 }]);
  assert.equal(offer.deliveryFee, 3.99, 'the fee is reported, so the flag is not just "fee missing"');
  assert.equal(offer.locationUnverified, true);
});

test('doordash templates build the search and store URLs around the delivery address', () => {
  const cfg = actorConfig('doordash', { APIFY_DOORDASH_ACTOR: 'dz_omar/doordash-scraper' });
  const search = renderInput(cfg.searchInput, { query: 'chicken tikka', limit: 8, address: 'Pittsburgh, PA 15213' });
  assert.deepEqual(search.startUrls, [{ url: 'https://www.doordash.com/search/store/chicken%20tikka?event_type=search' }]);
  assert.equal(search.address, 'Pittsburgh, PA 15213');
  assert.equal(search.maxResults, 8, 'the {{limit}} placeholder renders as a number');
  assert.equal(search.fetchReviews, false, 'reviews cost per row and are never read');
  const store = renderInput(cfg.storeInput, { storeUrl: 'https://www.doordash.com/store/977564', address: 'Pittsburgh, PA 15213' });
  assert.deepEqual(store.startUrls, [{ url: 'https://www.doordash.com/store/977564' }]);
  assert.equal(store.address, 'Pittsburgh, PA 15213');
});

test('the borderline Uber Eats profile pins the store id to the slug', () => {
  const f = fieldsFor(BORDERLINE_UBEREATS);
  assert.deepEqual(f.storeId, ['slug', 'storeUuid', 'uuid']);
  // A menu item's uuid can never be mistaken for the store's id.
  const row = { title: 'Ottimo', slug: 'ottimo-pizza', menu: [{ catalogItems: [{ uuid: 'item-uuid', name: 'X', price: 100 }] }] };
  assert.equal(normalizeListing(row, 'ubereats', '15213', f)?.platformRestaurantId, 'ottimo-pizza');
  assert.equal(normalizeListing(row, 'ubereats', '15213', f)?.name, 'Ottimo');
});
