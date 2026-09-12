import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBestWindow } from './bestWindow';
import type { PriceSnapshot } from '../models/types';

test('computeBestWindow finds the cheapest contiguous hours of the cheapest day', () => {
  const snaps: PriceSnapshot[] = [];
  // Wednesday 2026-09-09 (local) 12:00 .. 18:00, cheapest at 14-16
  for (let h = 12; h < 19; h += 1) {
    const at = new Date(2026, 8, 9, h, 0, 0);
    const total = h === 14 || h === 15 ? 20 : 25;
    snaps.push({ restaurantId: 'r', platformSlug: 'doordash', total, deliveryFee: 2, etaMin: 30, promoApplied: false, capturedAt: at });
    // a pricier platform at the same instant should not matter
    snaps.push({ restaurantId: 'r', platformSlug: 'grubhub', total: total + 5, deliveryFee: 2, etaMin: 30, promoApplied: false, capturedAt: at });
  }
  const w = computeBestWindow(snaps, 25);
  assert.ok(w);
  assert.equal(w.dayOfWeek, 3);
  assert.equal(w.startHour, 14);
  assert.equal(w.endHour, 16);
  assert.equal(w.avgTotal, 20);
  assert.equal(w.pctBelowNow, 20);
});

test('computeBestWindow returns null without data', () => {
  assert.equal(computeBestWindow([], 20), null);
});
