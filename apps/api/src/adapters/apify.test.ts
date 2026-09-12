/**
 * ApifyAdapter against a stub client — no network, no Apify credit spent.
 * The point of these is the run *accounting*: a scrape job prices many stores,
 * and each extra actor run is billed, so fetchOffer must reuse the search rows.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApifyAdapter, pickSubtotal } from './apify';
import type { ActorConfig } from './apify/actors';
import type { ApifyClient } from './apify/client';

const ACTORS: ActorConfig = {
  searchActor: 'test/search',
  searchInput: { search: '{{query}}', location: '{{address}}', maxItems: '{{limit}}' as unknown as never },
  storeActor: 'test/store',
  storeInput: { startUrls: [{ url: '{{storeUrl}}' }] },
};

interface Call {
  actorId: string;
  input: unknown;
}

/** Records every run and replays queued datasets. */
function stubClient(datasets: Record<string, unknown[]>): { client: ApifyClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    async run(actorId: string, input: unknown): Promise<unknown[]> {
      calls.push({ actorId, input });
      return datasets[actorId] ?? [];
    },
  } as unknown as ApifyClient;
  return { client, calls };
}

const SEARCH_ROW_WITH_MENU = {
  id: '1234567',
  name: 'Ramen Bar',
  address: '3703 Forbes Ave, Pittsburgh, PA 15213',
  deliveryFee: 2.99,
  serviceFee: 1.5,
  tax: 1.2,
  deliveryTime: '25-40 min',
  menuItems: [
    { name: 'Tonkotsu Ramen', price: 16.5 },
    { name: 'Gyoza', price: 7.25 },
  ],
};

const SEARCH_ROW_NO_MENU = { id: '7654321', name: 'Noodle House', address: '400 Craig St, Pittsburgh, PA 15213' };

test('searchRestaurants maps the dataset and renders the input template', async () => {
  const { client, calls } = stubClient({ 'test/search': [SEARCH_ROW_WITH_MENU, SEARCH_ROW_NO_MENU] });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  const listings = await adapter.searchRestaurants('15213', 'ramen');

  assert.equal(listings.length, 2);
  assert.equal(listings[0].platformRestaurantId, '1234567');
  assert.equal(listings[0].platformSlug, 'doordash');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actorId, 'test/search');
  assert.equal((calls[0].input as { search: string }).search, 'ramen');
});

test('fetchOffer reuses the search row instead of running a second actor', async () => {
  const { client, calls } = stubClient({ 'test/search': [SEARCH_ROW_WITH_MENU] });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  await adapter.searchRestaurants('15213', 'ramen');

  const offer = await adapter.fetchOffer('1234567', '15213', [{ name: 'Tonkotsu Ramen', quantity: 1 }]);
  assert.equal(calls.length, 1, 'no store-actor run for a search row that already had a menu');
  assert.equal(offer.subtotal, 16.5);
  assert.equal(offer.deliveryFee, 2.99);
  assert.equal(offer.serviceFee, 1.5);
  assert.equal(offer.tax, 1.2);
  assert.deepEqual([offer.etaMin, offer.etaMax], [25, 40]);
  // 16.50 + 2.99 + 1.50 + 1.20 + 2.48 (15% tip on the subtotal)
  assert.equal(offer.total, 24.67);
  assert.equal(offer.deepLink, 'https://www.doordash.com/store/1234567/');
});

test('fetchOffer runs the store actor when the search row had no menu', async () => {
  const { client, calls } = stubClient({
    'test/search': [SEARCH_ROW_NO_MENU],
    'test/store': [{ id: '7654321', name: 'Noodle House', deliveryFee: 0, menuItems: [{ name: 'Dan Dan Noodles', price: 13 }] }],
  });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  await adapter.searchRestaurants('15213', 'noodles');

  const offer = await adapter.fetchOffer('7654321', '15213', [{ name: 'Dan Dan Noodles', quantity: 2 }]);
  assert.deepEqual(calls.map((c) => c.actorId), ['test/search', 'test/store']);
  assert.deepEqual((calls[1].input as { startUrls: Array<{ url: string }> }).startUrls, [{ url: 'https://www.doordash.com/store/7654321/' }]);
  assert.equal(offer.subtotal, 26);

  // A second call for the same store reuses the store row too.
  await adapter.fetchOffer('7654321', '15213', [{ name: 'Dan Dan Noodles', quantity: 1 }]);
  assert.equal(calls.length, 2);
});

test('fees the actor never reported stay 0 rather than invented', async () => {
  const { client } = stubClient({ 'test/search': [{ id: '1', name: 'Bare', menuItems: [{ name: 'Bowl', price: 10 }] }] });
  const adapter = new ApifyAdapter('grubhub', client, ACTORS);
  await adapter.searchRestaurants('15213', 'bowl');
  const offer = await adapter.fetchOffer('1', '15213', [{ name: 'Bowl', quantity: 1 }]);
  assert.equal(offer.serviceFee, 0);
  assert.equal(offer.deliveryFee, 0);
  assert.equal(offer.tax, 0);
  assert.equal(offer.locationUnverified, true);
  assert.equal(offer.total, 11.5); // 10 + 15% tip
});

test('promo copy on the row becomes an offer promo', async () => {
  const { client } = stubClient({
    'test/search': [{ id: '1', name: 'Deal Co', offerText: '20% off orders $25+', menuItems: [{ name: 'Bowl', price: 30 }] }],
  });
  const adapter = new ApifyAdapter('ubereats', client, ACTORS);
  await adapter.searchRestaurants('15213', 'bowl');
  const offer = await adapter.fetchOffer('1', '15213', [{ name: 'Bowl', quantity: 1 }]);
  assert.equal(offer.promo?.rule.type, 'percent');
  assert.equal(offer.promo?.rule.value, 20);
  assert.equal(offer.promo?.rule.minSubtotal, 25);
});

test('an empty dataset is an empty listing list, not a crash', async () => {
  const { client } = stubClient({ 'test/search': [] });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  assert.deepEqual(await adapter.searchRestaurants('15213', 'ramen'), []);
});

test('rows that parse to no listings name the keys the actor actually sent', async () => {
  const { client } = stubClient({ 'test/search': [{ totallyUnexpected: 1, shape: 'here' }] });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  await assert.rejects(() => adapter.searchRestaurants('15213', 'ramen'), /totallyUnexpected, shape/);
});

test('fetchOffer without a menu anywhere fails loudly', async () => {
  const { client } = stubClient({ 'test/search': [SEARCH_ROW_NO_MENU], 'test/store': [{ id: '7654321', name: 'Noodle House' }] });
  const adapter = new ApifyAdapter('doordash', client, ACTORS);
  await adapter.searchRestaurants('15213', 'noodles');
  await assert.rejects(() => adapter.fetchOffer('7654321', '15213', [{ name: 'Dan Dan Noodles', quantity: 1 }]), /no priced menu item/);
});

test('pickSubtotal matches by name and falls back to a representative item', () => {
  const menu = [
    { name: 'Tonkotsu Ramen', price: 16.5 },
    { name: 'Gyoza', price: 7.25 },
    { name: 'Miso Ramen', price: 15 },
  ];
  assert.equal(pickSubtotal(menu, [{ name: 'tonkotsu ramen', quantity: 2 }]).subtotal, 33);
  const fallback = pickSubtotal(menu, [{ name: 'nothing like this', quantity: 1 }]);
  assert.equal(fallback.matched.length, 0);
  assert.ok(fallback.representative);
  assert.equal(fallback.subtotal, 15);
  assert.equal(pickSubtotal([], [{ name: 'x', quantity: 1 }]).subtotal, 0);
});
