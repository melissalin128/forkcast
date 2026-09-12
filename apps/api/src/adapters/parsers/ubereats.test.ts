/**
 * The embedded-state encoding is the real one (ubereats.com home page,
 * 2026-09-12): JSON with `\` -> %5C and `"` -> ". The search/store shapes
 * follow Uber's public web payloads (the pages themselves were bot-blocked from
 * the sandbox, see parsers/ubereats.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeEmbeddedJson } from './common';
import { parseCheckoutText, parseUberEatsSearch, parseUberEatsStore, pickUberEatsSubtotal, uberEatsPromo } from './ubereats';

/** Encode the way Uber does and wrap in the page skeleton. */
function uberPage(state: unknown): string {
  const body = JSON.stringify(state).replace(/\\/g, '%5C').replace(/"/g, '\\u0022');
  return `<!doctype html><html><head><title>Uber Eats</title></head><body><div id="root"></div>
  <script type="application/json" id="__REACT_QUERY_STATE__">
          ${body}
        </script></body></html>`;
}

const searchState = {
  mutations: [],
  queries: [
    { queryKey: ['getHomeMetaV1'], state: { data: { headTitle: 'Uber Eats', metaJson: '{"@context":"https:\\u002F\\u002Fschema.org"}' } } },
    {
      queryKey: ['getSearchFeedV1', { query: 'pizza' }],
      state: {
        data: {
          feedItems: [
            {
              type: 'STORE',
              uuid: 'feed-1',
              store: {
                storeUuid: '0f7e3b2a-1111-4c2d-9e5f-abcdefabcdef',
                title: { text: 'Pizza Fiesta' },
                rating: { text: '4.7', accessoryText: '(3,100+)' },
                image: { items: [{ url: 'https://tb-static.uber.com/pizza-fiesta.jpg' }] },
                meta: [{ text: '$0.49 Delivery Fee' }, { text: '20–35 min' }],
                actionUrl: '/store/pizza-fiesta/D3e0OyoTWWuNb7kAmQxFmw?diningMode=DELIVERY',
                categories: ['Pizza', 'Italian'],
              },
            },
            {
              type: 'STORE',
              uuid: 'feed-2',
              store: {
                storeUuid: 'dup-of-first',
                title: { text: 'Papa Johns (2763 E Carson St)' },
                rating: { text: '4.5' },
                meta: [{ text: 'Free Delivery' }, { text: '25 min' }],
                actionUrl: '/store/papa-johns/AbCdEfGhIjKlMnOpQrStUv',
                location: { streetAddress: '2763 E Carson St', postalCode: '15203' },
              },
            },
            { type: 'BANNER', uuid: 'feed-3', banner: { title: { text: 'not a store' } } },
          ],
        },
      },
    },
  ],
};

test('decodeEmbeddedJson undoes the Uber escaping', () => {
  const html = uberPage(searchState);
  const raw = html.match(/id="__REACT_QUERY_STATE__">([\s\S]*?)<\/script>/)![1];
  const decoded = decodeEmbeddedJson(raw) as { queries: Array<{ state: { data: { metaJson?: string } } }> };
  assert.equal(decoded.queries.length, 2);
  assert.equal(decoded.queries[0].state.data.metaJson, '{"@context":"https:\\u002F\\u002Fschema.org"}');
});

test('parseUberEatsSearch reads store cards from the SSR state', () => {
  const rows = parseUberEatsSearch(uberPage(searchState));
  assert.equal(rows.length, 2);
  const [fiesta, pj] = rows;
  assert.equal(fiesta.id, 'pizza-fiesta/D3e0OyoTWWuNb7kAmQxFmw');
  assert.equal(fiesta.name, 'Pizza Fiesta');
  assert.equal(fiesta.url, 'https://www.ubereats.com/store/pizza-fiesta/D3e0OyoTWWuNb7kAmQxFmw?diningMode=DELIVERY');
  assert.equal(fiesta.rating, 4.7);
  assert.equal(fiesta.ratingCount, 3100);
  assert.equal(fiesta.imageUrl, 'https://tb-static.uber.com/pizza-fiesta.jpg');
  assert.equal(fiesta.deliveryFee, 0.49);
  assert.equal(fiesta.etaMin, 20);
  assert.equal(fiesta.etaMax, 35);
  assert.deepEqual(fiesta.cuisines, ['Pizza', 'Italian']);
  assert.equal(pj.deliveryFee, 0);
  assert.equal(pj.etaMin, 25);
  assert.equal(pj.street, '2763 E Carson St');
  assert.equal(pj.zip, '15203');
});

test('parseUberEatsSearch also accepts the raw RPC JSON and rejects junk', () => {
  const rpc = JSON.stringify({ status: 'success', data: searchState.queries[1].state.data });
  assert.equal(parseUberEatsSearch(rpc).length, 2);
  assert.deepEqual(parseUberEatsSearch('<html><body>nothing here</body></html>'), []);
  assert.deepEqual(parseUberEatsSearch('{"status":"failure"}'), []);
});

const storeState = {
  mutations: [],
  queries: [
    {
      queryKey: ['getStoreV1', { storeUuid: 'abc' }],
      state: {
        data: {
          uuid: '0f7e3b2a-1111-4c2d-9e5f-abcdefabcdef',
          title: 'Pizza Fiesta',
          location: { address: '4911 Penn Ave, Pittsburgh, PA 15224', streetAddress: '4911 Penn Ave', postalCode: '15224', city: 'Pittsburgh' },
          rating: { ratingValue: 4.7, reviewCount: '3,100+' },
          categories: ['Pizza', 'Italian', 'Wings'],
          heroImageUrls: [{ url: 'https://tb-static.uber.com/hero.jpg', width: 550 }],
          etaRange: { text: '20–35 min' },
          fareBadge: { text: '$0.99 Delivery Fee' },
          fareInfo: { serviceFee: '15% service fee' },
          promotion: { text: 'Spend $25, save $5' },
          catalogSectionsMap: {
            'section-1': [
              {
                type: 'standardItems',
                payload: {
                  standardItemsPayload: {
                    catalogItems: [
                      { uuid: 'i1', title: 'Large Pepperoni Pizza', price: 1899, isAvailable: true },
                      { uuid: 'i2', title: 'Garlic Knots', price: 699, isAvailable: true },
                      { uuid: 'i3', title: 'Sold Out Special', price: 1200, isSoldOut: true },
                      { uuid: 'i4', title: 'No price' },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
  ],
};

test('parseUberEatsStore reads header facts and catalog prices', () => {
  const s = parseUberEatsStore(uberPage(storeState))!;
  assert.equal(s.name, 'Pizza Fiesta');
  assert.equal(s.street, '4911 Penn Ave');
  assert.equal(s.zip, '15224');
  assert.equal(s.rating, 4.7);
  assert.equal(s.ratingCount, 3100);
  assert.deepEqual(s.cuisines, ['Pizza', 'Italian', 'Wings']);
  assert.equal(s.imageUrl, 'https://tb-static.uber.com/hero.jpg');
  assert.equal(s.deliveryFee, 0.99);
  assert.equal(s.etaMin, 20);
  assert.equal(s.etaMax, 35);
  assert.equal(s.promoText, 'Spend $25, save $5');
  assert.equal(s.items.length, 3);
  assert.deepEqual(s.items[0], { id: 'i1', name: 'Large Pepperoni Pizza', price: 18.99, available: undefined });
  assert.equal(s.items[2].available, false);
  const promo = uberEatsPromo(s)!;
  assert.deepEqual(promo.rule, { type: 'flat', value: 5, minSubtotal: 25 });
  assert.equal(parseUberEatsStore('<html></html>'), null);
});

test('pickUberEatsSubtotal prefers name matches over the median item', () => {
  const s = parseUberEatsStore(uberPage(storeState))!;
  assert.equal(pickUberEatsSubtotal(s.items, [{ name: 'pepperoni pizza', quantity: 1 }]).subtotal, 18.99);
  const rep = pickUberEatsSubtotal(s.items, [{ name: 'sushi', quantity: 1 }]);
  assert.equal(rep.matched.length, 0);
  assert.equal(rep.representative?.name, 'Large Pepperoni Pizza');
});

test('parseCheckoutText reads fee lines from flattened checkout copy', () => {
  const text = `Your order  Large Pepperoni Pizza  $18.99
    Subtotal $18.99
    Delivery Fee $0.99
    Service Fee $2.85
    Small Order Fee $2.00
    Taxes & Other Fees $1.52
    Total $26.35`;
  assert.deepEqual(parseCheckoutText(text), { subtotal: 18.99, deliveryFee: 0.99, serviceFee: 2.85, smallOrderFee: 2, tax: 1.52, total: 26.35 });
  assert.deepEqual(parseCheckoutText('Delivery Fee Free • Estimated Tax $1.10'), { subtotal: undefined, deliveryFee: 0, serviceFee: undefined, smallOrderFee: undefined, tax: 1.1, total: undefined });
});
