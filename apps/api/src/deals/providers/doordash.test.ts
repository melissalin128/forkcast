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

test('normalize turns the fixture into deals, skipping stores with none', () => {
  const { deals, failures, storesWithoutDeals } = provider.normalize(fixture, ctx);

  assert.deepEqual(failures, [{ index: 3, reason: 'missing store_id or name', platformRestaurantId: undefined }]);
  assert.equal(storesWithoutDeals, 1, 'Bangkok Balcony has a plain fee and no offers');

  const headlines = deals.map((d) => d.headline);
  assert.deepEqual(headlines, [
    '$0.00 delivery fee',
    '20% off orders $25+',
    'Large Pepperoni Pizza: $18.00 $15.00',
    'Save $3 on Large Pepperoni Pizza',
    'Buy 1, get 1 free',
    'Free delivery on orders $15+ on Spicy Tuna Roll',
    'Free delivery',
  ]);
  assert.ok(!headlines.some((h) => h.includes('Garlic Knots')), 'an ordinary priced item is not a deal');
  assert.ok(!deals.some((d) => d.headline === '$4.99 delivery fee'), 'a plain delivery fee is not a deal');
});

test('deal fields: types, parsed values, distance computed by us, and the raw item kept', () => {
  const { deals } = provider.normalize(fixture, ctx);
  const byHeadline = new Map(deals.map((d) => [d.headline, d]));

  const freeDelivery = byHeadline.get('$0.00 delivery fee')!;
  assert.equal(freeDelivery.dealType, 'free_delivery');
  assert.deepEqual(freeDelivery.value, { deliveryFee: 0 });
  assert.equal(freeDelivery.platformRestaurantId, '1234567');
  assert.equal(freeDelivery.addressKey, '15232');
  assert.deepEqual(freeDelivery.cuisine, ['Pizza', 'Italian'], 'the offer tag is a deal, not a cuisine');
  assert.equal(freeDelivery.distanceMi, 0.2, 'haversine from the configured address, not the actor string');
  assert.equal(freeDelivery.deepLink, 'https://www.doordash.com/store/pizza-milano-pittsburgh-1234567/', 'relative url absolutized');
  assert.ok(freeDelivery.raw, 'raw payload kept so deals can be re-normalized without re-running');

  const percent = byHeadline.get('20% off orders $25+')!;
  assert.equal(percent.dealType, 'percent_off');
  assert.deepEqual(percent.value, { percent: 20 });
  assert.equal(percent.minOrder, 25);

  const struck = byHeadline.get('Large Pepperoni Pizza: $18.00 $15.00')!;
  assert.equal(struck.dealType, 'item_discount');
  assert.deepEqual(struck.value, { originalPrice: 18, salePrice: 15, dollars: 3, percent: 17 });

  assert.equal(byHeadline.get('Buy 1, get 1 free')!.dealType, 'bogo');
  assert.equal(byHeadline.get('Free delivery on orders $15+ on Spicy Tuna Roll')!.minOrder, 15);

  const absoluteUrl = byHeadline.get('Buy 1, get 1 free')!;
  assert.equal(absoluteUrl.deepLink, 'https://www.doordash.com/store/sushi-fuku-pittsburgh-7654321/', 'absolute url left alone');

  const noGeo = byHeadline.get('Free delivery')!;
  assert.equal(noGeo.geo, undefined);
  assert.equal(noGeo.distanceMi, undefined, 'no coordinates means unknown distance, never a guess');
});

test('normalize is tolerant: bad records are reported, not thrown, and reviews are ignored', () => {
  const items = [
    null,
    'not an object',
    { record_type: 'review', store_id: '1', text: 'great' },
    { store_id: '9', name: 'Ok Store', delivery_fee_display: 'Free delivery', menu_categories: 'not-an-array', tags: null },
    ...fixture,
  ];
  const { deals, failures } = provider.normalize(items, ctx);
  assert.deepEqual(
    failures.map((f) => f.index),
    [0, 1, 7],
    'null, a string and the id-less fixture store fail; the review is skipped silently',
  );
  assert.ok(deals.some((d) => d.platformRestaurantId === '9'), 'a store with junk sub-fields still yields its delivery deal');
  assert.equal(deals.length, 8);
});
