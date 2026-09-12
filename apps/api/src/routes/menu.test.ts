/**
 * GET /api/restaurants/:id/menu against the in-memory repository: the grouped
 * shape for a restaurant that exists, and the 404 for one that does not; plus
 * the cents/dollars repair the Mongo repo applies to scraped prices.
 * Run with the rest: npm test
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../app';
import { setRepo } from '../db';
import { MemoryRepository } from '../repo/memory';
import { dollars } from '../repo/mongo';

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

before(async () => {
  setRepo(MemoryRepository.seeded());
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  setRepo(null);
  await new Promise((resolve) => server.close(resolve));
});

test('returns the menu grouped by category', async () => {
  const list = await (await fetch(`${base}/api/restaurants`)).json();
  const id: string = list.results[0].id;

  const res = await fetch(`${base}/api/restaurants/${id}/menu`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.restaurantId, id);
  assert.ok(body.count > 0, 'expected at least one menu item');
  assert.equal(body.count, body.categories.flatMap((c: { items: unknown[] }) => c.items).length);

  const item = body.categories[0].items[0];
  assert.equal(typeof item.name, 'string');
  assert.equal(typeof item.basePrice, 'number');
  assert.ok(item.basePrice > 0 && item.basePrice < 1000, `basePrice should be dollars, got ${item.basePrice}`);
  assert.deepEqual(Object.keys(item).sort(), [
    'available', 'basePrice', 'calories', 'description', 'dietaryTags', 'name', 'observedPlatform', 'platformPrices',
  ]);
});

test('filters by category and honours limit', async () => {
  const list = await (await fetch(`${base}/api/restaurants`)).json();
  const id: string = list.results[0].id;
  const all = await (await fetch(`${base}/api/restaurants/${id}/menu`)).json();
  const category: string = all.categories[0].name;

  const res = await fetch(`${base}/api/restaurants/${id}/menu?category=${encodeURIComponent(category.toLowerCase())}&limit=1`);
  const body = await res.json();
  assert.equal(body.categories.length, 1);
  assert.equal(body.categories[0].name, category);
  assert.equal(body.count, 1);
});

test('404s for an unknown restaurant', async () => {
  const res = await fetch(`${base}/api/restaurants/not-a-restaurant/menu`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'restaurant not found' });
});

test('400s on a bad limit', async () => {
  const res = await fetch(`${base}/api/restaurants/anything/menu?limit=0`);
  assert.equal(res.status, 400);
});

test('dollars() repairs the mixed cents/dollars scrape units', () => {
  assert.equal(dollars(738), 7.38); // integer cents under $10.01
  assert.equal(dollars(1000), 10);
  assert.equal(dollars(22), 22); // already dollars
  assert.equal(dollars(11.95), 11.95);
  assert.equal(dollars(349.99), 349.99); // real catering tray
  assert.equal(dollars(1567.3), 15.67); // fractional raw cents
  assert.equal(dollars(undefined), 0);
});
