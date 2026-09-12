/**
 * The DoorDash provider against the saved fixture. If the actor's output shape
 * changes, these fail before anything reaches the database.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseDealsConfig } from '../config';
import type { NormalizeContext } from './types';
import { DoorDashDealProvider, searchUrl } from './doordash';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../__fixtures__/doordash-search.json'), 'utf8')) as unknown[];

const address = {
  key: '15232',
  label: 'Shadyside',
  streetAddress: '5500 Walnut St, Pittsburgh, PA 15232',
  lat: 40.4514,
  lng: -79.933,
  radiusMi: 3,
};
const ctx: NormalizeContext = { address, now: new Date('2026-09-12T17:30:00Z') };
const provider = new DoorDashDealProvider();

const actor = parseDealsConfig({
  addresses: [address],
  feedQueries: ['pizza', 'sushi', 'chinese', 'burgers', 'indian', 'thai'],
  actors: { doordash: { actorId: 'dz_omar/doordash-scraper', pricing: { perResultUsd: 0.006 }, input: { includeMenu: true, fetchReviews: false } } },
}).actors.doordash!;

test('searchUrl URL-encodes the query into the configured template', () => {
  assert.equal(searchUrl(actor.searchUrlTemplate, 'pizza'), 'https://www.doordash.com/search/store/pizza?event_type=search');
  assert.equal(searchUrl(actor.searchUrlTemplate, 'thai food'), 'https://www.doordash.com/search/store/thai%20food?event_type=search');
});

test('feed input splits the run cap across queries, since maxResults is per URL', () => {
  const input = provider.buildInput({ kind: 'feed', address, queries: ['pizza', 'sushi', 'chinese', 'burgers', 'indian', 'thai'], maxResults: 36, actor });
  assert.equal((input.startUrls as unknown[]).length, 6);
  assert.equal(input.maxResults, 6, '6 per URL x 6 URLs = the 36 cap');
  assert.equal(input.address, '5500 Walnut St, Pittsburgh, PA 15232');
  assert.equal(input.includeMenu, true);
  assert.equal(input.fetchReviews, false, 'reviews are billed per review and we never use them');
  assert.deepEqual((input.startUrls as Array<{ url: string }>)[0], { url: 'https://www.doordash.com/search/store/pizza?event_type=search' });
});

test('search input is one URL at the full cap', () => {
  const input = provider.buildInput({ kind: 'search', address, query: 'primanti bros', maxResults: 20, actor });
  assert.equal((input.startUrls as unknown[]).length, 1);
  assert.equal(input.maxResults, 20);
  assert.throws(() => provider.buildInput({ kind: 'search', address, query: '  ', maxResults: 20, actor }), /no search queries/);
});

test('normalize turns the real fixture into deals, skipping stores with none', () => {
  const { deals, failures, storesWithoutDeals } = provider.normalize(fixture, ctx);

  assert.deepEqual(failures, [{ index: 6, reason: 'missing store_id or name', platformRestaurantId: undefined }]);
  assert.equal(storesWithoutDeals, 1, 'a store whose only badges are "#N Most liked" has no deal');

  assert.deepEqual(
    deals.map((d) => `${d.restaurantName} | ${d.dealType} | ${d.headline}`),
    [
      'Pizza Parma | percent_off | 40% off',
      "Little Nipper's Pizza II | percent_off | 25% off",
      "Little Nipper's Pizza II | bogo | Buy 1, get 1 free",
      'Pizza Pronto | free_delivery | Meal Box: $0 delivery fee',
      'Pizza Pronto | bogo | Buy 1, get 1 free',
      'Pizza Fiesta | item_discount | Free on $20+',
      "Domino's | free_delivery | $0 delivery fee",
      "Domino's | bogo | Buy 1, get 1 free",
    ],
  );
});

test('"$0 delivery fee, first order" is a signup promo for the viewer, not a deal at the restaurant', () => {
  // logged out, DoorDash shows this on nearly every store; treating it as a deal would mark the
  // entire feed free-delivery and tell the user nothing
  const firstOrder = fixture.filter((s) => (s as { delivery_fee_display?: string }).delivery_fee_display?.includes('first order'));
  assert.ok(firstOrder.length >= 4, 'the fixture really does carry the trap');

  const { deals } = provider.normalize(fixture, ctx);
  assert.ok(!deals.some((d) => d.headline.includes('first order')));
  assert.deepEqual(
    deals.filter((d) => d.dealType === 'free_delivery').map((d) => d.restaurantName),
    ['Pizza Pronto', "Domino's"],
    'only a genuine store-level $0 fee and a $0-delivery item badge survive',
  );
});

test('popularity badges are not offers', () => {
  const { deals } = provider.normalize(fixture, ctx);
  assert.ok(!deals.some((d) => /most liked/i.test(d.headline)));
});

test('one deal per distinct offer per store, with the items carrying it kept in the raw payload', () => {
  const { deals } = provider.normalize(fixture, ctx);
  const bogo = deals.find((d) => d.restaurantName === "Little Nipper's Pizza II" && d.dealType === 'bogo')!;
  const raw = bogo.raw as { items: string[]; itemCount: number };
  assert.ok(raw.itemCount >= 1, 'the badge appears on at least one item');
  assert.ok(raw.items.length <= 10, 'the item list is capped');
  assert.equal(deals.filter((d) => d.restaurantName === "Little Nipper's Pizza II" && d.dealType === 'bogo').length, 1);
});

test('deal fields: parsed values, cuisine from tags, and distance computed by us', () => {
  const { deals } = provider.normalize(fixture, ctx);
  const byKey = new Map(deals.map((d) => [`${d.restaurantName}|${d.dealType}`, d]));

  const pct = byKey.get("Little Nipper's Pizza II|percent_off")!;
  assert.deepEqual(pct.value, { percent: 25 });
  assert.equal(pct.addressKey, '15232');
  assert.ok(pct.cuisine.length > 0 && pct.cuisine.every((c) => typeof c === 'string'));
  assert.ok(pct.deepLink?.startsWith('https://www.doordash.com/'), 'relative store urls are absolutized');
  assert.ok(typeof pct.distanceMi === 'number' && pct.distanceMi < 3, 'haversine from the configured address');

  const freeItem = byKey.get('Pizza Fiesta|item_discount')!;
  assert.equal(freeItem.minOrder, 20, '"Free on $20+" states its threshold');

  const dominos = byKey.get("Domino's|free_delivery")!;
  assert.deepEqual(dominos.value, { deliveryFee: 0 });
});

test('normalize is tolerant: bad records are reported, not thrown, and reviews are ignored', () => {
  const items = [
    null,
    'not an object',
    { record_type: 'review', store_id: '1', text: 'great' },
    { store_id: '9', name: 'Ok Store', delivery_fee_display: '$0 delivery fee', menu_categories: 'not-an-array', tags: null },
    ...fixture,
  ];
  const { deals, failures } = provider.normalize(items, ctx);
  assert.deepEqual(failures.map((f) => f.index), [0, 1, 10], 'null and a string fail, the review is skipped silently');
  assert.ok(deals.some((d) => d.platformRestaurantId === '9'), 'a store with junk sub-fields still yields its delivery deal');
});
