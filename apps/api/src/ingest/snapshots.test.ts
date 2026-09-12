import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dupCount, quote } from './snapshots';

const DD = { slug: 'doordash', fee: 2.99, markup: 1.1, surge: 1.8 } as const;

test('quote is deterministic, cents-rounded, and peaks at dinner', () => {
  const lunchSun = new Date(2026, 8, 6, 12, 0, 0); // Sunday noon
  const dinnerSun = new Date(2026, 8, 6, 19, 0, 0);
  const nightSun = new Date(2026, 8, 6, 3, 0, 0);

  const a = quote('pie-shop', 14.5, 2, DD, lunchSun, '2026-09-06T16');
  const b = quote('pie-shop', 14.5, 2, DD, lunchSun, '2026-09-06T16');
  assert.deepEqual(a, b); // same key -> same row, so a re-run is idempotent

  for (const q of [a, quote('pie-shop', 14.5, 2, DD, dinnerSun, '2026-09-06T23')]) {
    assert.equal(q.total, Math.round(q.total * 100) / 100);
    assert.equal(q.deliveryFee, Math.round(q.deliveryFee * 100) / 100);
    assert.ok(q.deliveryFee >= 0 && q.etaMin > 0);
  }

  const night = quote('pie-shop', 14.5, 2, DD, nightSun, '2026-09-06T07');
  const dinner = quote('pie-shop', 14.5, 2, DD, dinnerSun, '2026-09-06T23');
  assert.ok(dinner.deliveryFee > night.deliveryFee);
  assert.ok(dinner.etaMin > night.etaMin);
});

test('a re-run carries on past duplicate keys but not past real write errors', () => {
  // Mongoose re-spreads the driver's WriteError, so `code` ends up under `err`.
  const dup = { err: { code: 11000 } };
  assert.equal(dupCount({ writeErrors: [dup, dup, dup] }), 3);
  assert.equal(dupCount({ code: 11000 }), 1); // single-error shape: no writeErrors array
  assert.equal(dupCount({ writeErrors: [{ code: 11000 }] }), 1); // pre-spread getter
  assert.equal(dupCount({ writeErrors: [dup, { err: { code: 121 } }] }), -1); // one real failure -> rethrow
  assert.equal(dupCount(new Error('connection closed')), -1);
});
