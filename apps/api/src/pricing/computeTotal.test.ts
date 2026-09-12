import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotal, normalizeSubscription } from './computeTotal';
import type { Promo } from '../models/types';

const NOW = new Date('2026-09-11T18:30:00Z');
const day = 24 * 3600 * 1000;

const base = {
  subtotal: 20,
  serviceFee: 3,
  deliveryFee: 3.99,
  smallOrderFee: 0,
  tax: 1.4,
};

const promo = (over: Partial<Promo>): Promo => ({
  platformSlug: 'doordash',
  code: 'TEST',
  rule: { type: 'percent', value: 20, minSubtotal: 0 },
  startsAt: new Date(NOW.getTime() - day),
  endsAt: new Date(NOW.getTime() + day),
  ...over,
});

test('no subscriptions, no promos: sums every line with a 15% default tip', () => {
  const r = computeTotal({ ...base, platformSlug: 'doordash' }, [], [], 0.15, NOW);
  assert.equal(r.tip, 3);
  assert.equal(r.promoDiscount, 0);
  assert.equal(r.total, 20 + 3 + 3.99 + 0 + 1.4 + 3);
  assert.equal(r.subscriptionApplied, undefined);
});

test('DashPass waives DoorDash delivery and drops service fee to 5% when subtotal >= 12', () => {
  const r = computeTotal({ ...base, platformSlug: 'doordash' }, ['dashpass'], [], 0.15, NOW);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.serviceFee, 1);
  assert.equal(r.subscriptionApplied, 'dashpass');
  assert.equal(r.total, 20 + 1 + 0 + 1.4 + 3);
});

test('DashPass does nothing under the $12 minimum', () => {
  const r = computeTotal({ ...base, subtotal: 11.5, platformSlug: 'doordash' }, ['dashpass'], [], 0.15, NOW);
  assert.equal(r.deliveryFee, 3.99);
  assert.equal(r.serviceFee, 3);
  assert.equal(r.subscriptionApplied, undefined);
});

test('DashPass does not touch Uber Eats or Grubhub offers', () => {
  const ue = computeTotal({ ...base, platformSlug: 'ubereats' }, ['dashpass'], [], 0.15, NOW);
  const gh = computeTotal({ ...base, platformSlug: 'grubhub' }, ['dashpass'], [], 0.15, NOW);
  assert.equal(ue.deliveryFee, 3.99);
  assert.equal(gh.deliveryFee, 3.99);
});

test('Uber One: waived delivery + 5% service fee only at >= $15 subtotal', () => {
  const ok = computeTotal({ ...base, subtotal: 15, platformSlug: 'ubereats' }, ['uberone'], [], 0.15, NOW);
  assert.equal(ok.deliveryFee, 0);
  assert.equal(ok.serviceFee, 0.75);
  const no = computeTotal({ ...base, subtotal: 14.99, platformSlug: 'ubereats' }, ['uberone'], [], 0.15, NOW);
  assert.equal(no.deliveryFee, 3.99);
  assert.equal(no.serviceFee, 3);
});

test('Grubhub+ waives delivery only and leaves the service fee alone', () => {
  const r = computeTotal({ ...base, platformSlug: 'grubhub' }, ['Grubhub+'], [], 0.15, NOW);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.serviceFee, 3);
  assert.equal(r.subscriptionApplied, 'grubhubplus');
});

test('percent promo applies within its window and is ignored outside it', () => {
  const live = computeTotal({ ...base, platformSlug: 'doordash' }, [], [promo({})], 0.15, NOW);
  assert.equal(live.promoDiscount, 4);
  assert.equal(live.promoCode, 'TEST');
  assert.equal(live.total, 20 + 3 + 3.99 + 1.4 + 3 - 4);

  const expired = computeTotal(
    { ...base, platformSlug: 'doordash' },
    [],
    [promo({ endsAt: new Date(NOW.getTime() - 60_000) })],
    0.15,
    NOW,
  );
  assert.equal(expired.promoDiscount, 0);
  assert.equal(expired.promoCode, undefined);

  const notYet = computeTotal(
    { ...base, platformSlug: 'doordash' },
    [],
    [promo({ startsAt: new Date(NOW.getTime() + 60_000) })],
    0.15,
    NOW,
  );
  assert.equal(notYet.promoDiscount, 0);
});

test('flat promo respects minSubtotal and never exceeds the subtotal', () => {
  const under = computeTotal(
    { ...base, platformSlug: 'doordash' },
    [],
    [promo({ rule: { type: 'flat', value: 5, minSubtotal: 25 } })],
    0.15,
    NOW,
  );
  assert.equal(under.promoDiscount, 0);

  const over = computeTotal(
    { ...base, platformSlug: 'doordash' },
    [],
    [promo({ rule: { type: 'flat', value: 5, minSubtotal: 20 } })],
    0.15,
    NOW,
  );
  assert.equal(over.promoDiscount, 5);

  const capped = computeTotal(
    { ...base, subtotal: 4, platformSlug: 'doordash' },
    [],
    [promo({ rule: { type: 'flat', value: 50, minSubtotal: 0 } })],
    0.15,
    NOW,
  );
  assert.equal(capped.promoDiscount, 4);
});

test('freeDelivery promo discounts the post-subscription delivery fee (zero if already waived)', () => {
  const free = promo({ platformSlug: 'grubhub', code: 'FREEDEL', rule: { type: 'freeDelivery', value: 0, minSubtotal: 0 } });
  const noSub = computeTotal({ ...base, platformSlug: 'grubhub' }, [], [free], 0.15, NOW);
  assert.equal(noSub.promoDiscount, 3.99);
  const withSub = computeTotal({ ...base, platformSlug: 'grubhub' }, ['grubhubplus'], [free], 0.15, NOW);
  assert.equal(withSub.promoDiscount, 0);
});

test('promos for another platform are ignored; the biggest eligible discount wins', () => {
  const promos = [
    promo({ platformSlug: 'ubereats', code: 'UE20', rule: { type: 'percent', value: 50, minSubtotal: 0 } }),
    promo({ code: 'DD10', rule: { type: 'percent', value: 10, minSubtotal: 0 } }),
    promo({ code: 'DD5', rule: { type: 'flat', value: 5, minSubtotal: 0 } }),
  ];
  const r = computeTotal({ ...base, platformSlug: 'doordash' }, [], promos, 0.15, NOW);
  assert.equal(r.promoCode, 'DD5');
  assert.equal(r.promoDiscount, 5);
});

test('tip percentage is configurable and total never drops below zero', () => {
  const r = computeTotal({ ...base, platformSlug: 'doordash' }, [], [], 0, NOW);
  assert.equal(r.tip, 0);
  const huge = computeTotal(
    { ...base, subtotal: 5, serviceFee: 0, deliveryFee: 0, tax: 0, platformSlug: 'doordash' },
    [],
    [promo({ rule: { type: 'flat', value: 5, minSubtotal: 0 } })],
    0,
    NOW,
  );
  assert.equal(huge.total, 0);
});

test('normalizeSubscription tolerates display names', () => {
  assert.equal(normalizeSubscription('DashPass'), 'dashpass');
  assert.equal(normalizeSubscription('Uber One'), 'uberone');
  assert.equal(normalizeSubscription('Grubhub+'), 'grubhubplus');
  assert.equal(normalizeSubscription('grubhub-plus'), 'grubhubplus');
  assert.equal(normalizeSubscription('postmates'), null);
});
