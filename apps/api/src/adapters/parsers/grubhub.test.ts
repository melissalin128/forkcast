/**
 * Fixtures mirror the real api-gtm.grubhub.com payloads captured on 2026-09-12
 * (zip 15213, query "pizza"): search_listing rows, restaurants/{id} and menu_items.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grubhubFeeLines, grubhubPromo, parseGrubhubMenuItems, parseGrubhubRestaurant, parseGrubhubSearch, pickGrubhubSubtotal } from './grubhub';

const searchListing = JSON.stringify({
  listing_id: 'abc',
  stats: { total_results: 2, result_count: 2, page_size: 36, total_hits: 51 },
  pager: { total_pages: 1, current_page: 1 },
  results: [
    {
      restaurant_id: '7545440',
      name: 'Papa Johns',
      cuisines: ['Pizza', 'American', 'Italian', 'Lunch Specials', 'Wings'],
      ratings: { rating_count: 376, rating_value: '4', rating_bayesian10_point: 4.6, actual_rating_value: 4.648922707189938 },
      logo: 'https://media-cdn.grubhub.com/image/upload/v1640708602/txsxrnipbvauezr79bxm.png',
      address: { address_locality: 'Pittsburgh', address_region: 'PA', postal_code: '15203', street_address: '2763 E Carson St' },
      delivery_fee: { price: 149, currency: 'USD' },
      delivery_time_estimate: 27,
      delivery_time_estimate_lower_bound: 27,
      delivery_time_estimate_upper_bound: 42,
      distance_from_location: '0.54',
      price_rating: 2,
      open: true,
      merchant_url_path: 'papa-johns-2763-e-carson-st-pittsburgh',
      menu_items: [
        { id: '261231683041', name: 'Pepperoni Pizza', available: true, price: 1199, price_display: { amount: { price: 1199 }, styled_text: { text: '$11.99+' } }, popular: true },
        { id: '261231683809', name: 'Sausage Pizza', available: true, price: 1199, popular: false },
      ],
    },
    {
      restaurant_id: 269370,
      name: 'Genoa Pizza & Bar',
      cuisines: ['Pizza'],
      ratings: { rating_count: 7551, rating_bayesian10_point: 4.6 },
      media_image: { base_url: 'https://res.cloudinary.com/grubhub/image/upload/', public_id: 'engbpixkm3yxqvbkblf5', format: 'png' },
      address: { postal_code: '15222', street_address: '111 Market St' },
      delivery_fee: { price: 199 },
      delivery_time_estimate: 35,
      open: true,
    },
    { name: 'junk without id' },
    'not an object',
  ],
});

test('parseGrubhubSearch reads search_listing rows', () => {
  const rows = parseGrubhubSearch(searchListing);
  assert.equal(rows.length, 2);
  const [pj, genoa] = rows;
  assert.equal(pj.id, '7545440');
  assert.equal(pj.name, 'Papa Johns');
  assert.deepEqual(pj.cuisines.slice(0, 2), ['Pizza', 'American']);
  assert.equal(pj.rating, 4.6);
  assert.equal(pj.ratingCount, 376);
  assert.equal(pj.imageUrl, 'https://media-cdn.grubhub.com/image/upload/v1640708602/txsxrnipbvauezr79bxm.png');
  assert.equal(pj.street, '2763 E Carson St');
  assert.equal(pj.zip, '15203');
  assert.equal(pj.deliveryFee, 1.49);
  assert.equal(pj.etaMin, 27);
  assert.equal(pj.etaMax, 42);
  assert.equal(pj.distanceMi, 0.54);
  assert.equal(pj.urlPath, 'papa-johns-2763-e-carson-st-pittsburgh');
  assert.equal(pj.menuItems.length, 2);
  assert.deepEqual(pj.menuItems[0], { id: '261231683041', name: 'Pepperoni Pizza', price: 11.99, popular: true, available: true, category: undefined, taxRate: undefined });
  // numeric id, cloudinary image, single ETA estimate
  assert.equal(genoa.id, '269370');
  assert.equal(genoa.imageUrl, 'https://res.cloudinary.com/grubhub/image/upload/engbpixkm3yxqvbkblf5.png');
  assert.equal(genoa.etaMin, 35);
  assert.equal(genoa.etaMax, 50);
});

test('parseGrubhubSearch accepts the older search_result wrapper and junk', () => {
  const wrapped = JSON.stringify({ search_result: { results: [{ restaurant_id: '1', name: 'X', cuisines: [] }] } });
  assert.equal(parseGrubhubSearch(wrapped)[0].name, 'X');
  assert.deepEqual(parseGrubhubSearch('not json'), []);
  assert.deepEqual(parseGrubhubSearch('{"results": "nope"}'), []);
  assert.deepEqual(parseGrubhubSearch('[]'), []);
});

const restaurantPayload = JSON.stringify({
  restaurant_availability: {
    restaurant_id: '269370',
    delivery_fee: { amount: 199, currency: 'USD' },
    delivery_fee_without_discounts: { amount: 299 },
    sales_tax: 7,
    order_minimum: { amount: 1000 },
    delivery_offered_to_diner_location: true,
    open: true,
    open_delivery: true,
    delivery_estimate: 35,
    delivery_estimate_range: '{"maximum":45,"minimum":35}',
    delivery_estimate_range_v2: { maximum: 45, minimum: 35 },
  },
  restaurant: {
    id: '269370',
    name: 'Genoa Pizza & Bar',
    address: { locality: 'Pittsburgh', region: 'PA', postal_code: '15222-1601', zip: '15222', street_address: '111 Market St' },
    cuisines: ['Calzones', 'Dinner', 'Pizza'],
    rating: { rating_count: '7551', rating_value: '5' },
    rating_bayesian10_point: 4.6,
    logo: 'https://media-cdn.grubhub.com/image/upload/v1699670782/lg6yfuzbwuiarktefqhv.jpg',
    price_rating: 3,
    order_type_settings: {
      service_fee: {
        name: 'Service fee',
        description: 'A service fee of 10.0% for delivery orders will be charged with Genoa Pizza & Bar.',
        delivery_fee: { fee_type: 'PERCENT', percent_value: 10, maximum_amount_for_percent: { amount: 900, currency: 'USD' } },
      },
      small_order_fee: { name: 'Small order delivery fee', minimum_order_value_cents: 1000, fee: { fee_type: 'FLAT', flat_cents_value: { amount: 200 } } },
      delivery_estimate_minutes: 35,
      pickup_estimate_minutes: 15,
    },
    available_promo_codes: ['SAVE5'],
    available_offers: [{ description: '$5 off orders $25+' }],
    restaurant_coupons: [],
  },
});

test('parseGrubhubRestaurant reads fees, ETA, tax and promos', () => {
  const s = parseGrubhubRestaurant(restaurantPayload)!;
  assert.equal(s.id, '269370');
  assert.equal(s.name, 'Genoa Pizza & Bar');
  assert.equal(s.street, '111 Market St');
  assert.equal(s.zip, '15222');
  assert.equal(s.rating, 4.6);
  assert.equal(s.ratingCount, 7551);
  assert.equal(s.deliveryFee, 1.99);
  assert.equal(s.deliveryFeeWithoutDiscounts, 2.99);
  assert.equal(s.salesTaxPct, 7);
  assert.equal(s.etaMin, 35);
  assert.equal(s.etaMax, 45);
  assert.equal(s.orderMinimum, 10);
  assert.equal(s.serviceFeePct, 10);
  assert.equal(s.serviceFeeMax, 9);
  assert.equal(s.smallOrderFee, 2);
  assert.equal(s.smallOrderBelow, 10);
  assert.equal(s.open, true);
  assert.equal(s.deliversHere, true);
  assert.deepEqual(s.promoCodes, ['SAVE5']);
  assert.deepEqual(s.offers, ['$5 off orders $25+']);
  const promo = grubhubPromo(s, new Date('2026-09-12T12:00:00Z'))!;
  assert.equal(promo.code, 'SAVE5');
  assert.deepEqual(promo.rule, { type: 'flat', value: 5, minSubtotal: 25 });
});

test('parseGrubhubRestaurant is defensive about missing pieces', () => {
  assert.equal(parseGrubhubRestaurant('{}'), null);
  assert.equal(parseGrubhubRestaurant('garbage'), null);
  const s = parseGrubhubRestaurant(JSON.stringify({ restaurant: { name: 'Bare' } }))!;
  assert.equal(s.name, 'Bare');
  assert.equal(s.deliveryFee, undefined);
  assert.equal(s.salesTaxPct, undefined);
  assert.deepEqual(s.cuisines, []);
  assert.deepEqual(s.promoCodes, []);
});

test('grubhubFeeLines applies the percent cap, small-order threshold and tax rate', () => {
  const s = parseGrubhubRestaurant(restaurantPayload)!;
  assert.deepEqual(grubhubFeeLines(s, 15.99), { deliveryFee: 1.99, serviceFee: 1.6, smallOrderFee: 0, tax: 1.12, taxEstimated: false });
  // below the $10 small-order threshold
  assert.equal(grubhubFeeLines(s, 8).smallOrderFee, 2);
  // 10% of $120 = $12 -> capped at $9
  assert.equal(grubhubFeeLines(s, 120).serviceFee, 9);
  // no sales_tax in payload -> default rate, flagged
  const bare = parseGrubhubRestaurant(JSON.stringify({ restaurant: { name: 'Bare' } }))!;
  assert.deepEqual(grubhubFeeLines(bare, 10, 0.06), { deliveryFee: 0, serviceFee: 0, smallOrderFee: 0, tax: 0.6, taxEstimated: true });
});

const menuItems = JSON.stringify({
  restaurant_data: {},
  menu_items: [
    {
      id: '276747986217',
      name: 'Chicken Bacon Ranch Oven-Toasted Sandwich',
      menu_category_name: 'Sandwiches',
      price: { amount: 0, currency: 'USD' },
      delivery_price: { amount: 0 },
      minimum_price_variation: { amount: 999 },
      tax_rate: { rate: 0 },
      available: true,
      popular: false,
    },
    { id: '2', name: 'The Works Pizza', price: { amount: 1599 }, tax_rate: { rate: 0.07 }, available: true, popular: true },
    { id: '3', name: 'Sold out thing', price: { amount: 500 }, available: false },
    { id: 4, name: '' },
  ],
});

test('parseGrubhubMenuItems falls back to the minimum price variation', () => {
  const items = parseGrubhubMenuItems(menuItems);
  assert.equal(items.length, 3);
  assert.equal(items[0].price, 9.99);
  assert.equal(items[0].category, 'Sandwiches');
  assert.equal(items[0].taxRate, undefined);
  assert.equal(items[1].price, 15.99);
  assert.equal(items[1].taxRate, 0.07);
  assert.equal(items[1].popular, true);
  assert.deepEqual(parseGrubhubMenuItems('nope'), []);
});

test('pickGrubhubSubtotal matches cart lines by name, else picks a representative', () => {
  const items = parseGrubhubMenuItems(menuItems);
  const matched = pickGrubhubSubtotal(items, [{ name: 'works pizza', quantity: 2 }]);
  assert.equal(matched.subtotal, 31.98);
  assert.equal(matched.matched[0].name, 'The Works Pizza');
  const rep = pickGrubhubSubtotal(items, [{ name: 'Lobster Thermidor', quantity: 1 }]);
  assert.equal(rep.representative?.name, 'The Works Pizza'); // popular first
  assert.equal(rep.subtotal, 15.99);
  // sold-out items are never priced
  assert.equal(pickGrubhubSubtotal(items, [{ name: 'Sold out thing', quantity: 1 }]).matched.length, 0);
});
