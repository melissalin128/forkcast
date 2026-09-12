/**
 * Deals-layer contract of the Repository, exercised on the memory store:
 * upsert identity and lifecycle fields, deactivation scoped by run kind,
 * list filters, and the ScrapeRun ledger the cost guard reads.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewDeal } from '../models/types';
import { MemoryRepository } from './memory';

const t0 = new Date('2026-09-12T08:00:00Z');
const t1 = new Date('2026-09-12T12:30:00Z');
const t2 = new Date('2026-09-12T17:30:00Z');

const deal = (over: Partial<NewDeal> = {}): NewDeal => ({
  platform: 'doordash',
  restaurantName: 'Pizza Milano',
  platformRestaurantId: '1234567',
  cuisine: ['Pizza'],
  distanceMi: 0.8,
  dealType: 'free_delivery',
  headline: '$0 delivery fee',
  addressKey: '15232',
  deepLink: 'https://www.doordash.com/store/1234567/',
  ...over,
});

test('upsertDeals inserts, then updates on the same key and keeps first-seen fields', async () => {
  const repo = MemoryRepository.empty();
  const first = await repo.upsertDeals([deal(), deal({ platformRestaurantId: '2', restaurantName: 'Sushi Fuku' })], { at: t0, runId: 'run-A', runKind: 'feed' });
  assert.deepEqual(first, { inserted: 2, updated: 0 });

  const second = await repo.upsertDeals([deal({ value: { deliveryFee: 0 } })], { at: t1, runId: 'run-B', runKind: 'search' });
  assert.deepEqual(second, { inserted: 0, updated: 1 });

  const all = await repo.listDeals({ addressKey: '15232' });
  assert.equal(all.length, 2, 'no duplicate rows');
  const milano = all.find((d) => d.platformRestaurantId === '1234567')!;
  assert.equal(milano.firstSeenAt, t0);
  assert.equal(milano.firstRunId, 'run-A');
  assert.equal(milano.lastSeenAt, t1);
  assert.equal(milano.lastRunId, 'run-B');
  assert.equal(milano.lastRunKind, 'search');
  assert.deepEqual(milano.value, { deliveryFee: 0 });
  assert.equal(milano.isActive, true);
});

test('a different headline for the same store is a different deal', async () => {
  const repo = MemoryRepository.empty();
  await repo.upsertDeals([deal(), deal({ headline: '20% off orders $25+', dealType: 'percent_off' })], { at: t0 });
  assert.equal((await repo.listDeals()).length, 2);
});

test('deactivateDeals retires only deals last seen before the cutoff, optionally by run kind, and upsert re-activates', async () => {
  const repo = MemoryRepository.empty();
  await repo.upsertDeals([deal()], { at: t0, runId: 'feed-1', runKind: 'feed' });
  await repo.upsertDeals([deal({ platformRestaurantId: 'search-only', restaurantName: 'Primanti Bros' })], { at: t0, runId: 'search-1', runKind: 'search' });
  await repo.upsertDeals([deal({ platformRestaurantId: 'fresh' })], { at: t2, runId: 'feed-2', runKind: 'feed' });

  // feed-2 finished at t2 and did not return the t0 feed deal -> inactive; the search-only deal is left alone
  const n = await repo.deactivateDeals('doordash', '15232', { lastSeenBefore: t2, lastRunKind: 'feed' });
  assert.equal(n, 1);
  const active = await repo.listDeals({ addressKey: '15232' });
  assert.deepEqual(active.map((d) => d.platformRestaurantId).sort(), ['fresh', 'search-only']);
  assert.equal((await repo.listDeals({ activeOnly: false })).length, 3, 'nothing is deleted');

  // staleness sweep without a kind retires the search-only deal too
  assert.equal(await repo.deactivateDeals('doordash', '15232', { lastSeenBefore: t1 }), 1);
  assert.equal((await repo.listDeals()).length, 1);

  // a later sighting brings a deal back
  await repo.upsertDeals([deal()], { at: t2, runId: 'feed-3', runKind: 'feed' });
  assert.equal((await repo.listDeals()).length, 2);
});

test('listDeals filters by platform, type, distance, text and expiry', async () => {
  const repo = MemoryRepository.empty();
  await repo.upsertDeals(
    [
      deal(),
      deal({ platformRestaurantId: 'far', restaurantName: 'Burgatory', cuisine: ['Burgers'], distanceMi: 6.2, dealType: 'dollar_off', headline: '$5 off $20+' }),
      deal({ platformRestaurantId: 'nogeo', restaurantName: 'Mystery', distanceMi: undefined }),
      deal({ platformRestaurantId: 'expired', restaurantName: 'Old Deal', expiresAt: t1 }),
    ],
    { at: t0 },
  );
  assert.equal((await repo.listDeals({ dealType: 'dollar_off' })).length, 1);
  assert.equal((await repo.listDeals({ platform: 'grubhub' })).length, 0);
  assert.deepEqual(
    (await repo.listDeals({ maxDistanceMi: 3, now: t0 })).map((d) => d.platformRestaurantId).sort(),
    ['1234567', 'expired', 'nogeo'],
    'unknown distance is kept, far is dropped',
  );
  assert.equal((await repo.listDeals({ q: 'burg' })).length, 1, 'matches cuisine');
  assert.equal((await repo.listDeals({ q: 'milano' })).length, 1, 'matches name');
  assert.equal((await repo.listDeals({ now: t2 })).length, 3, 'expired deal is hidden after expiresAt');
  assert.equal((await repo.listDeals({ now: t2, limit: 2 })).length, 2);
});

test('ScrapeRun ledger: create, update, lookup by Apify id, counts and cost sums', async () => {
  const repo = MemoryRepository.empty();
  const base = { platform: 'doordash' as const, addressKey: '15232', actorId: 'user/actor', startedAt: t0 };
  const skipped = await repo.createScrapeRun({ ...base, kind: 'feed', status: 'skipped', estimatedCost: 0.12, error: 'daily feed cap reached' });
  const feed = await repo.createScrapeRun({ ...base, kind: 'feed', status: 'running', estimatedCost: 0.12, apifyRunId: 'apify-1' });
  const search = await repo.createScrapeRun({ ...base, kind: 'search', query: 'ramen', status: 'running', estimatedCost: 0.1, startedAt: t1 });

  assert.equal(skipped.resultsReturned, 0);
  assert.equal((await repo.getScrapeRunByApifyId('apify-1'))?.id, feed.id);
  assert.equal(await repo.getScrapeRunByApifyId('nope'), null);

  const updated = await repo.updateScrapeRun(feed.id, { status: 'succeeded', finishedAt: t1, actualCost: 0.09, resultsReturned: 20, dealsExtracted: 7, undefinedField: undefined } as never);
  assert.equal(updated?.status, 'succeeded');
  assert.equal(updated?.actualCost, 0.09);
  assert.equal((await repo.getScrapeRun(feed.id))?.dealsExtracted, 7);
  assert.equal(await repo.updateScrapeRun('missing', { status: 'failed' }), null);

  assert.equal(await repo.countScrapeRuns({ kind: 'feed' }), 2, 'skipped attempts are counted as attempts');
  assert.equal(await repo.countScrapeRuns({ kind: 'feed', status: ['running', 'succeeded'] }), 1);
  assert.equal(await repo.countScrapeRuns({ kind: 'search', since: t1 }), 1);
  assert.equal(await repo.countScrapeRuns({ kind: 'search', query: 'pho' }), 0);

  // actual cost replaces the estimate once known; skipped runs never cost anything
  assert.equal(Math.round((await repo.sumScrapeRunCost()) * 100) / 100, 0.19);
  assert.equal(await repo.sumScrapeRunCost(t1), 0.1);

  const newest = await repo.listScrapeRuns({ limit: 1 });
  assert.equal(newest[0].id, search.id);
});
