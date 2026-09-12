import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDoorDashStore, parseMoney, parseTier, parseUberStore, parseZip } from './apifyPlatforms';

test('parseMoney handles cents, dollars, and display strings', () => {
  assert.equal(parseMoney(1599), 15.99);
  assert.equal(parseMoney('$11.99'), 11.99);
  assert.equal(parseMoney('$0 delivery fee, first order'), 0);
  assert.equal(parseMoney('20% off'), 20);
});

test('parseZip and parseTier', () => {
  assert.equal(parseZip('216 N Craig St, Pittsburgh, PA 15213, USA'), '15213');
  assert.equal(parseTier(2), 2);
  assert.equal(parseTier('$$'), 2);
});

test('parseDoorDashStore reads store + menu categories', () => {
  const store = parseDoorDashStore({
    store_id: '977564',
    name: "Little Nipper's Pizza II",
    address: '216 N Craig St, Pittsburgh, PA 15213, USA',
    lat: 40.45,
    lng: -79.95,
    rating: 4.5,
    num_ratings: '2025',
    price_range: 2,
    delivery_fee_display: '$0 delivery fee, first order',
    asap_minutes: 29,
    url: 'https://www.doordash.com/store/977564',
    menu_categories: [
      {
        category_name: 'Pizzas',
        items: [{ name: 'Cheese Pizza', price_cents: 1499, description: 'Vegetarian' }],
      },
    ],
  });
  assert.ok(store);
  assert.equal(store!.storeId, '977564');
  assert.equal(store!.zip, '15213');
  assert.equal(store!.items[0]?.price, 14.99);
  assert.ok(store!.items[0]?.dietary.includes('vegetarian'));
});

test('parseUberStore reads uuid + catalog items', () => {
  const store = parseUberStore({
    uuid: 'abc',
    title: 'Tsaocaa',
    url: 'https://ubereats.com/store/x',
    location: { streetAddress: '124 Oakland Avenue', postalCode: '15213', latitude: 40.44, longitude: -79.95 },
    rating: { ratingValue: 4.9, ratingCount: '700+' },
    deliveryFee: { amount: 0 },
    etaMinutes: { min: 32 },
    cuisineList: ['Asian', 'Bubble Tea'],
    menu: [{ catalogName: 'Drinks', catalogItems: [{ title: 'Boba Milk Tea', price: '$5.99' }] }],
  });
  assert.ok(store);
  assert.equal(store!.platformSlug, 'ubereats');
  assert.equal(store!.items[0]?.price, 5.99);
  assert.equal(store!.ratingCount, 700);
});
