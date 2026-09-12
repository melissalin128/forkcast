import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Deal } from '../models/types';
import { DEFAULT_DEALS_CONFIG_PATH, loadDealsConfig } from './config';
import { NOMINAL_ORDER_USD, rankDeals, savingsUsd, scoreDeal } from './score';

const weights = loadDealsConfig(DEFAULT_DEALS_CONFIG_PATH).scoreWeights;

const deal = (over: Partial<Deal>): Deal => ({
  platform: 'doordash',
  restaurantName: 'Test',
  platformRestaurantId: '1',
  cuisine: [],
  dealType: 'other',
  headline: 'h',
  addressKey: '15232',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  isActive: true,
  ...over,
});

test('savingsUsd prefers a stated dollar amount, then a struck price, then a percent', () => {
  assert.equal(savingsUsd({ dollars: 5 }, 20), 5);
  assert.equal(savingsUsd({ originalPrice: 20, salePrice: 15 }, undefined), 5);
  assert.equal(savingsUsd({ percent: 20 }, 25), 5, '20% of the stated $25 minimum');
  assert.equal(savingsUsd({ percent: 20 }, undefined), 0.2 * NOMINAL_ORDER_USD);
  assert.equal(savingsUsd({ deliveryFee: 0 }, undefined), undefined, 'free delivery states no dollar value');
  assert.equal(savingsUsd(undefined, undefined), undefined);
});

test('an unparseable deal falls back to the per-type default and says so', () => {
  const free = scoreDeal(deal({ dealType: 'free_delivery', value: { deliveryFee: 0 }, distanceMi: 1 }), weights);
  assert.equal(free.savings, weights.defaultSavingsByType.free_delivery);
  assert.equal(free.savingsEstimated, true);

  const known = scoreDeal(deal({ dealType: 'dollar_off', value: { dollars: 5 }, minOrder: 20, distanceMi: 1 }), weights);
  assert.equal(known.savings, 5);
  assert.equal(known.savingsEstimated, false);
});

test('score penalizes delivery fee, minimum order and distance', () => {
  const base = deal({ dealType: 'dollar_off', value: { dollars: 10 }, distanceMi: 0 });
  const near = scoreDeal(base, weights).score;
  assert.ok(scoreDeal({ ...base, distanceMi: 5 }, weights).score < near, 'farther is worse');
  assert.ok(scoreDeal({ ...base, minOrder: 30 }, weights).score < near, 'a high minimum is worse');
  assert.ok(scoreDeal({ ...base, value: { dollars: 10, deliveryFee: 4 } }, weights).score < near, 'a delivery fee is worse');
  // an unknown distance is penalized, but less than being genuinely far away
  const unknown = scoreDeal({ ...base, distanceMi: undefined }, weights).score;
  assert.ok(unknown < near && unknown > scoreDeal({ ...base, distanceMi: 5 }, weights).score);
});

test('rankDeals puts the best value first and breaks ties deterministically', () => {
  const ranked = rankDeals(
    [
      deal({ restaurantName: 'Far big discount', dealType: 'dollar_off', value: { dollars: 12 }, distanceMi: 4 }),
      deal({ restaurantName: 'Close small discount', dealType: 'dollar_off', value: { dollars: 3 }, distanceMi: 0.3 }),
      deal({ restaurantName: 'Zulu tie', dealType: 'dollar_off', value: { dollars: 3 }, distanceMi: 0.3 }),
      deal({ restaurantName: 'High minimum', dealType: 'percent_off', value: { percent: 20 }, minOrder: 50, distanceMi: 0.3 }),
    ],
    weights,
  );
  assert.equal(ranked[0].restaurantName, 'Far big discount');
  assert.deepEqual(ranked.slice(1).map((d) => d.restaurantName), ['High minimum', 'Close small discount', 'Zulu tie']);
  assert.ok(ranked[0].score > ranked[3].score);
});
