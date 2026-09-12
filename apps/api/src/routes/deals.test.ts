/**
 * The deals endpoints against an in-process app and the memory store. No
 * network, no Apify: the search route's background refresh is refused by the
 * cost guard (no actor id in the test config), which is itself the behaviour
 * worth pinning down.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { setRepo } from '../db';
import { parseDealsConfig, setDealsConfig } from '../deals/config';
import type { NewDeal } from '../models/types';
import { MemoryRepository } from '../repo/memory';

const now = new Date('2026-09-12T17:30:00Z');
let server: Server;
let base: string;
let repo: MemoryRepository;

const cfg = parseDealsConfig({
  addresses: [
    { key: '15232', label: 'Shadyside', streetAddress: '5500 Walnut St, Pittsburgh, PA 15232', lat: 40.4514, lng: -79.933 },
    { key: '15213', label: 'Oakland', streetAddress: '3700 Forbes Ave, Pittsburgh, PA 15213', lat: 40.4406, lng: -79.9559 },
  ],
  feedQueries: ['pizza'],
  // no actorId: a search must still answer from the database and report why it did not refresh
  actors: { doordash: { actorId: '', pricing: {} } },
});

const deal = (over: Partial<NewDeal>): NewDeal => ({
  platform: 'doordash',
  restaurantName: 'Pizza Milano',
  platformRestaurantId: '1',
  cuisine: ['Pizza'],
  distanceMi: 0.5,
  dealType: 'free_delivery',
  headline: '$0 delivery fee',
  addressKey: '15232',
  deepLink: 'https://www.doordash.com/store/1/',
  ...over,
});

const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};
const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

before(async () => {
  setDealsConfig(cfg);
  repo = MemoryRepository.empty();
  setRepo(repo);

  await repo.upsertDeals(
    [
      deal({ headline: '$0 delivery fee' }),
      deal({ platformRestaurantId: '2', restaurantName: 'Burgatory', cuisine: ['Burgers'], dealType: 'dollar_off', headline: '$8 off $25+', value: { dollars: 8 }, minOrder: 25, distanceMi: 1.2 }),
      deal({ platformRestaurantId: '3', restaurantName: 'Far Away Thai', cuisine: ['Thai'], dealType: 'bogo', headline: 'Buy 1 get 1', distanceMi: 9 }),
      deal({ platformRestaurantId: '4', restaurantName: 'Expired Place', headline: 'Gone', expiresAt: new Date('2026-09-01T00:00:00Z') }),
      deal({ platformRestaurantId: '5', restaurantName: 'Oakland Pizza', addressKey: '15213' }),
    ],
    { at: now, runId: 'apify-1', runKind: 'feed' },
  );
  await repo.createScrapeRun({
    platform: 'doordash', addressKey: '15232', kind: 'feed', actorId: 'dz_omar/doordash-scraper',
    apifyRunId: 'apify-1', startedAt: now, finishedAt: new Date('2026-09-12T17:32:00Z'),
    status: 'succeeded', estimatedCost: 0.216, actualCost: 0.198, resultsReturned: 12, dealsExtracted: 5,
  });

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  setRepo(null);
  setDealsConfig(null);
});

test('GET /api/deals ranks active deals for the default address and reports freshness', async () => {
  const { status, body } = await get('/api/deals');
  assert.equal(status, 200);
  assert.equal(body.address, '15232');
  assert.equal(body.refreshedAt, '2026-09-12T17:32:00.000Z');
  assert.deepEqual(body.platforms, ['doordash']);

  const deals = body.deals as Array<Record<string, never>>;
  // BOGO's default savings ($8) outweighs 9 mi at the configured distance penalty; both are tunable in config
  assert.deepEqual(deals.map((d) => d.restaurantName), ['Burgatory', 'Far Away Thai', 'Pizza Milano']);
  assert.ok(!deals.some((d) => d.restaurantName === 'Expired Place'), 'expired deals are hidden');
  assert.ok(!deals.some((d) => d.restaurantName === 'Oakland Pizza'), 'another address is not mixed in');

  const [best] = deals;
  assert.equal(best.savings, 8);
  assert.equal(best.savingsEstimated, false);
  assert.equal(best.dealType, 'dollar_off');
  assert.equal(best.minOrder, 25);
  assert.equal(best.deepLink, 'https://www.doordash.com/store/1/');
  const freeDelivery = deals.find((d) => d.restaurantName === 'Pizza Milano')!;
  assert.equal(freeDelivery.savingsEstimated, true, 'free delivery states no dollar value, so the per-type default is used');
});

test('GET /api/deals filters by type, distance, text and address', async () => {
  assert.equal(((await get('/api/deals?type=bogo')).body.deals as unknown[]).length, 1);
  assert.equal(((await get('/api/deals?maxDistance=2')).body.deals as unknown[]).length, 2, 'the 9 mi deal is dropped');
  assert.equal(((await get('/api/deals?q=burg')).body.deals as unknown[]).length, 1, 'matches cuisine or name');
  assert.equal(((await get('/api/deals?platform=doordash&limit=1')).body.deals as unknown[]).length, 1);
  assert.equal(((await get('/api/deals?address=15213')).body.deals as unknown[]).length, 1);

  const bad = await get('/api/deals?address=99999');
  assert.equal(bad.status, 400);
  assert.match(String(bad.body.error), /unknown address/);
  assert.equal((await get('/api/deals?type=not-a-type')).status, 400);
});

test('POST /api/deals/search answers from the database and reports the refresh verdict', async () => {
  const { status, body } = await post('/api/deals/search', { q: 'burgatory' });
  assert.equal(status, 200);
  assert.equal((body.deals as unknown[]).length, 1);
  const job = body.job as Record<string, never>;
  assert.equal(job.started, false, 'no actor id configured, so nothing was started');
  assert.equal(job.code, 'not_configured');
  assert.equal(await repo.countScrapeRuns({ kind: 'search' }), 0, 'a refusal to configure is not a run');

  const quiet = await post('/api/deals/search', { q: 'pizza', refresh: false });
  assert.equal((quiet.body.job as Record<string, never>).started, false);
  assert.equal((quiet.body.deals as unknown[]).length, 1);

  assert.equal((await post('/api/deals/search', { q: '' })).status, 400);
});

test('GET /api/deals/jobs/:id reports a run, 404s an unknown one', async () => {
  const [run] = await repo.listScrapeRuns({ limit: 1 });
  const { body } = await get(`/api/deals/jobs/${run.id}`);
  assert.equal(body.status, 'succeeded');
  assert.equal(body.apifyRunId, 'apify-1');
  assert.equal((await get('/api/deals/jobs/nope')).status, 404);
});

test('GET /api/deals/runs reports the ledger and what is left of the budget', async () => {
  const { body } = await get('/api/deals/runs');
  assert.equal(body.count, 1);
  const budget = body.budget as Record<string, never>;
  assert.equal(budget.spentUsd, 0.198, 'actual cost, not the estimate');
  assert.equal(budget.ceilingUsd, 5);
  assert.equal(budget.remainingUsd, 4.802);
  const [run] = body.runs as Array<Record<string, never>>;
  assert.equal(run.apifyRunId, 'apify-1');
  assert.equal(run.estimatedCost, 0.216);
  assert.equal(((await get('/api/deals/runs?kind=search')).body.runs as unknown[]).length, 0);
});
