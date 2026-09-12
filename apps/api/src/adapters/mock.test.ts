import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockAdapter, demandMultiplier } from './mock';
import { restaurants } from '../seed/data';
import { cartForRestaurant } from './types';

const r = restaurants.find((x) => x.platformIds.doordash && x.platformIds.ubereats && x.platformIds.grubhub)!;
const dd = new MockAdapter('doordash');

test('demand curve: dinner peak > baseline, Fri/Sat higher, Tue/Wed afternoon lowest', () => {
  const tue15 = new Date(2026, 8, 8, 15); // Tuesday
  const wed10 = new Date(2026, 8, 9, 10); // Wednesday morning (baseline)
  const thu19 = new Date(2026, 8, 10, 19); // Thursday dinner peak
  const fri19 = new Date(2026, 8, 11, 19); // Friday dinner peak
  assert.equal(demandMultiplier(wed10), 1);
  assert.ok(demandMultiplier(tue15) < demandMultiplier(wed10));
  assert.ok(demandMultiplier(thu19) > demandMultiplier(wed10));
  assert.ok(demandMultiplier(fri19) > demandMultiplier(thu19));
  assert.equal(demandMultiplier(new Date(2026, 8, 10, 18)), 1.25);
  assert.equal(demandMultiplier(new Date(2026, 8, 10, 17)), 1.15);
});

test('mock offers are deterministic for the same store + hour and cheaper off-peak', async () => {
  const cart = cartForRestaurant(r);
  const a = await dd.fetchOffer(r.platformIds.doordash!, '15213', cart, { at: new Date(2026, 8, 11, 19, 5) });
  const b = await dd.fetchOffer(r.platformIds.doordash!, '15213', cart, { at: new Date(2026, 8, 11, 19, 40) });
  assert.deepEqual({ ...a, fetchedAt: 0 }, { ...b, fetchedAt: 0 });

  const offPeak = await dd.fetchOffer(r.platformIds.doordash!, '15213', cart, { at: new Date(2026, 8, 8, 15) });
  assert.ok(offPeak.total < a.total, `expected off-peak ${offPeak.total} < peak ${a.total}`);
  assert.ok(offPeak.deliveryFee < a.deliveryFee);
  assert.ok(offPeak.etaMin <= a.etaMin);
});

test('mock applies platform markup and per-platform fee profiles', async () => {
  const cart = cartForRestaurant(r);
  const at = new Date(2026, 8, 9, 10);
  const offers = await Promise.all(
    (['doordash', 'ubereats', 'grubhub'] as const).map((p) => new MockAdapter(p).fetchOffer(r.platformIds[p]!, '15213', cart, { at })),
  );
  const [d, u, g] = offers;
  assert.equal(d.subtotal, Math.round(r.sampleItem.menuPrice * 1.12 * 100) / 100);
  assert.equal(u.subtotal, Math.round(r.sampleItem.menuPrice * 1.15 * 100) / 100);
  assert.equal(g.subtotal, Math.round(r.sampleItem.menuPrice * 1.08 * 100) / 100);
  for (const o of offers) {
    assert.ok(o.total > o.subtotal);
    assert.equal(o.tax, Math.round(o.subtotal * 0.07 * 100) / 100);
    assert.ok(o.etaMax > o.etaMin);
  }
});

test('searchRestaurants only returns stores listed on that platform', async () => {
  const gh = new MockAdapter('grubhub');
  const results = await gh.searchRestaurants('15217', 'pizza');
  assert.ok(results.length > 0);
  assert.ok(results.every((l) => l.platformSlug === 'grubhub' && restaurants.some((x) => x.platformIds.grubhub === l.platformRestaurantId)));
  assert.ok(results.every((l) => l.cuisine.some((c) => c.toLowerCase().includes('pizza')) || l.name.toLowerCase().includes('pizza')));
});
