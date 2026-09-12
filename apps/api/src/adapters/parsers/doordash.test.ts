/**
 * doordash.com was bot-blocked from the sandbox, so these fixtures follow the
 * GraphQL / SSR shapes documented in parsers/doordash.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doorDashPromo, parseDoorDashSearch, parseDoorDashStore, pickDoorDashSubtotal } from './doordash';

const searchResponse = JSON.stringify({
  data: {
    searchWithFilterFacetFeed: {
      body: [
        {
          id: 'list.store_search',
          body: [
            {
              id: 'row.store:1234567',
              __typename: 'FacetV2',
              text: { title: 'Papa Johns', subtitle: '4.7★ (3,900+) • Pizza • 0.6 mi • 24 min', accessory: '$0 delivery fee' },
              images: { main: { uri: 'https://img.cdn4dd.com/papa-johns.jpg' } },
              logging: { store_id: 1234567, store_name: 'Papa Johns' },
              events: { click: { data: { uri: '/store/papa-johns-pittsburgh-1234567/' } } },
            },
            {
              id: 'row.store:7654321',
              text: { title: 'Fuel and Fuddle', subtitle: '4.3 (1.4k+) • American • 1.1 mi' },
              logging: { store_id: 7654321 },
              custom: { cuisine: ['American', 'Burgers'] },
              address: { street: '212 Oakland Ave', postalCode: '15213' },
            },
            { id: 'row.item:99', text: { title: 'Not a store' }, logging: { store_id: 5 } },
          ],
        },
      ],
    },
  },
});

test('parseDoorDashSearch reads FacetV2 store rows from the GraphQL response', () => {
  const rows = parseDoorDashSearch(searchResponse);
  assert.equal(rows.length, 2);
  const [pj, fuel] = rows;
  assert.equal(pj.id, '1234567');
  assert.equal(pj.name, 'Papa Johns');
  assert.equal(pj.url, 'https://www.doordash.com/store/1234567/');
  assert.equal(pj.rating, 4.7);
  assert.equal(pj.ratingCount, 3900);
  assert.equal(pj.imageUrl, 'https://img.cdn4dd.com/papa-johns.jpg');
  assert.equal(pj.deliveryFee, 0);
  assert.equal(pj.etaMin, 24);
  assert.deepEqual(pj.cuisines, ['Pizza']);
  assert.equal(fuel.id, '7654321');
  assert.deepEqual(fuel.cuisines, ['American', 'Burgers']);
  assert.equal(fuel.street, '212 Oakland Ave');
  assert.equal(fuel.zip, '15213');
  assert.equal(fuel.ratingCount, 1400);
});

test('parseDoorDashSearch reads SSR state from HTML and tolerates junk', () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { feed: JSON.parse(searchResponse).data } } })}</script>
    <script>window.__APOLLO_STATE__ = {"Store:42":{"__typename":"Store","storeId":42,"name":"Apollo Store","displayDeliveryFee":"$1.99 delivery fee"}};</script></body></html>`;
  const rows = parseDoorDashSearch(html);
  assert.deepEqual(rows.map((r) => r.id).sort(), ['1234567', '42', '7654321']);
  assert.equal(rows.find((r) => r.id === '42')?.deliveryFee, 1.99);
  assert.deepEqual(parseDoorDashSearch('<html></html>'), []);
  assert.deepEqual(parseDoorDashSearch('{"data":null}'), []);
});

const storeResponse = JSON.stringify({
  data: {
    storepageFeed: {
      storeHeader: {
        id: '1234567',
        name: 'Papa Johns',
        address: { street: '2763 E Carson St', city: 'Pittsburgh', postalCode: '15203' },
        ratings: { averageRating: 4.7, numRatings: 3900 },
        displayDeliveryFee: '$0.00 delivery fee',
        deliveryTimeLayout: { title: '25 min', subtitle: 'delivery time' },
        businessHeaderImgUrl: 'https://img.cdn4dd.com/header.jpg',
        promotions: [{ title: '20% off orders $25+' }],
      },
      itemLists: [
        { name: 'Popular', items: [{ id: 'i1', name: 'Pepperoni Pizza', displayPrice: '$13.99' }, { id: 'i2', name: 'Garlic Knots', price: 699 }] },
        { name: 'Drinks', items: [{ id: 'i3', name: 'Water', displayPrice: '$0.00' }] },
      ],
    },
  },
});

test('parseDoorDashStore reads the header and item prices', () => {
  const s = parseDoorDashStore(storeResponse)!;
  assert.equal(s.id, '1234567');
  assert.equal(s.name, 'Papa Johns');
  assert.equal(s.street, '2763 E Carson St');
  assert.equal(s.zip, '15203');
  assert.equal(s.rating, 4.7);
  assert.equal(s.ratingCount, 3900);
  assert.equal(s.imageUrl, 'https://img.cdn4dd.com/header.jpg');
  assert.equal(s.deliveryFee, 0);
  assert.equal(s.etaMin, 25);
  assert.equal(s.etaMax, 35);
  assert.equal(s.promoText, '20% off orders $25+');
  assert.deepEqual(s.items, [
    { id: 'i1', name: 'Pepperoni Pizza', price: 13.99 },
    { id: 'i2', name: 'Garlic Knots', price: 6.99 },
  ]);
  const promo = doorDashPromo(s)!;
  assert.deepEqual(promo.rule, { type: 'percent', value: 20, minSubtotal: 25 });
  assert.equal(parseDoorDashStore('<html></html>'), null);
});

test('pickDoorDashSubtotal', () => {
  const s = parseDoorDashStore(storeResponse)!;
  assert.equal(pickDoorDashSubtotal(s.items, [{ name: 'Pepperoni Pizza', quantity: 2 }]).subtotal, 27.98);
  assert.equal(pickDoorDashSubtotal(s.items, [{ name: 'ramen', quantity: 1 }]).representative?.name, 'Pepperoni Pizza');
});
