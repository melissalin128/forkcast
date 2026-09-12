import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MemoryRepository } from '../repo/memory';
import type { ApifyClient, ApifyRun } from './apify';
import { parseDealsConfig } from './config';
import { ingestRun, reconcileRuns } from './ingest';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__/doordash-search.json'), 'utf8')) as unknown[];
const now = new Date('2026-09-12T17:30:00Z');
const later = new Date('2026-09-12T22:00:00Z');

const cfg = parseDealsConfig({
  addresses: [{ key: '15232', label: 'Shadyside', streetAddress: '5500 Walnut St, Pittsburgh, PA 15232', lat: 40.4514, lng: -79.933 }],
  feedQueries: ['pizza', 'sushi'],
  caps: { maxResultsPerRun: 36, staleAfterHours: 36 },
  actors: { doordash: { actorId: 'dz_omar/doordash-scraper', pricing: { perResultUsd: 0.006 } } },
});

const run = (over: Partial<ApifyRun> = {}): ApifyRun => ({
  id: 'apify-1',
  actId: 'dz_omar/doordash-scraper',
  status: 'SUCCEEDED',
  defaultDatasetId: 'ds-1',
  startedAt: '2026-09-12T17:28:00.000Z',
  finishedAt: '2026-09-12T17:29:30.000Z',
  usageTotalUsd: 0.198,
  ...over,
});

function fakeClient(apifyRun: ApifyRun, items: unknown[] = fixture): { client: ApifyClient; datasetCalls: unknown[][] } {
  const datasetCalls: unknown[][] = [];
  const client = {
    async getRun() {
      return apifyRun;
    },
    async getDatasetItems(id: string, opts: { limit?: number }) {
      datasetCalls.push([id, opts]);
      return items;
    },
  } as unknown as ApifyClient;
  return { client, datasetCalls };
}

async function seedRunningLedger(repo: MemoryRepository, over: Record<string, unknown> = {}) {
  return repo.createScrapeRun({
    platform: 'doordash',
    addressKey: '15232',
    kind: 'feed',
    query: 'pizza, sushi',
    actorId: 'dz_omar/doordash-scraper',
    apifyRunId: 'apify-1',
    datasetId: 'ds-1',
    startedAt: now,
    status: 'running',
    estimatedCost: 0.216,
    ...over,
  });
}

test('a successful feed run is normalized, upserted, and closed out with the real cost', async () => {
  const repo = MemoryRepository.empty();
  const ledger = await seedRunningLedger(repo);
  const { client, datasetCalls } = fakeClient(run());

  const res = await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client, now, log: () => undefined });

  assert.equal(res.ok, true);
  assert.equal(res.resultsReturned, 7);
  assert.equal(res.dealsExtracted, 8);
  assert.equal(res.inserted, 8);
  assert.equal(res.updated, 0);
  assert.equal(res.parseFailures, 1, 'the id-less fixture record');
  assert.equal(res.storesWithoutDeals, 1);
  assert.equal(res.actualCost, 0.198);
  assert.deepEqual(datasetCalls[0], ['ds-1', { limit: 36 }], 'never reads more than the configured cap');

  const stored = await repo.getScrapeRun(ledger.id);
  assert.equal(stored?.status, 'succeeded');
  assert.equal(stored?.actualCost, 0.198);
  assert.equal(stored?.dealsExtracted, 8);
  assert.equal(stored?.finishedAt?.toISOString(), '2026-09-12T17:29:30.000Z');

  const deals = await repo.listDeals({ addressKey: '15232' });
  assert.equal(deals.length, 8);
  assert.ok(deals.every((d) => d.firstRunId === 'apify-1' && d.lastRunKind === 'feed'));
});

test('a second feed run updates repeat sightings and retires what it no longer returns', async () => {
  const repo = MemoryRepository.empty();
  await seedRunningLedger(repo);
  await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client: fakeClient(run()).client, now, log: () => undefined });

  // the later run only still sees Domino's $0 delivery fee: one surviving deal out of the eight
  const dominos = fixture.find((s) => (s as { name?: string }).name === "Domino's") as Record<string, unknown>;
  const shrunk = [{ ...dominos, menu_categories: [], featured_items: undefined }];
  await seedRunningLedger(repo, { apifyRunId: 'apify-2', startedAt: later });
  const res = await ingestRun({
    repo,
    apifyRunId: 'apify-2',
    cfg,
    client: fakeClient(run({ id: 'apify-2', usageTotalUsd: 0.05 }), shrunk).client,
    now: later,
    log: () => undefined,
  });

  assert.equal(res.inserted, 0);
  assert.equal(res.updated, 1, 'the surviving deal is a repeat sighting, not a duplicate');
  assert.equal(res.deactivated, 7);

  const active = await repo.listDeals({ addressKey: '15232' });
  assert.deepEqual(active.map((d) => d.headline), ['$0 delivery fee']);
  assert.equal(active[0].firstSeenAt.toISOString(), now.toISOString(), 'first sighting preserved');
  assert.equal(active[0].lastSeenAt.toISOString(), later.toISOString());
  assert.equal(active[0].lastRunId, 'apify-2');
  assert.equal((await repo.listDeals({ activeOnly: false })).length, 8, 'nothing deleted');
});

test('a search run never retires the feed, only genuinely stale deals', async () => {
  const repo = MemoryRepository.empty();
  await seedRunningLedger(repo);
  await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client: fakeClient(run()).client, now, log: () => undefined });

  await seedRunningLedger(repo, { apifyRunId: 'apify-3', kind: 'search', query: 'ramen', startedAt: later });
  const res = await ingestRun({
    repo,
    apifyRunId: 'apify-3',
    cfg,
    client: fakeClient(run({ id: 'apify-3' }), []).client,
    now: later,
    log: () => undefined,
  });
  assert.equal(res.deactivated, 0, 'a search that found nothing must not wipe the feed');
  assert.equal((await repo.listDeals()).length, 8);

  // once past the staleness window they do age out
  const muchLater = new Date(now.getTime() + 40 * 3600 * 1000);
  await seedRunningLedger(repo, { apifyRunId: 'apify-4', kind: 'search', query: 'ramen', startedAt: muchLater });
  const aged = await ingestRun({ repo, apifyRunId: 'apify-4', cfg, client: fakeClient(run({ id: 'apify-4' }), []).client, now: muchLater, log: () => undefined });
  assert.equal(aged.deactivated, 8);
});

test('ingest is idempotent: a finished run is not read or billed twice', async () => {
  const repo = MemoryRepository.empty();
  await seedRunningLedger(repo);
  const { client, datasetCalls } = fakeClient(run());
  await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client, now, log: () => undefined });
  const again = await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client, now, log: () => undefined });

  assert.equal(again.skipped, 'already_ingested');
  assert.equal(datasetCalls.length, 1, 'the dataset was read once');
  assert.equal((await repo.listDeals()).length, 8, 'no duplicate deals');

  const forced = await ingestRun({ repo, apifyRunId: 'apify-1', cfg, client, now, force: true, log: () => undefined });
  assert.equal(forced.skipped, undefined);
  assert.equal(forced.updated, 8, 're-ingest updates in place');
});

test('a run started by an Apify Schedule gets a ledger row from the webhook parameters', async () => {
  const repo = MemoryRepository.empty();
  const res = await ingestRun({
    repo,
    apifyRunId: 'apify-sched',
    cfg,
    client: fakeClient(run({ id: 'apify-sched' })).client,
    fallback: { platform: 'doordash', addressKey: '15232', kind: 'feed' },
    now,
    log: () => undefined,
  });
  assert.equal(res.ok, true);
  const [ledger] = await repo.listScrapeRuns();
  assert.equal(ledger.apifyRunId, 'apify-sched');
  assert.equal(ledger.status, 'succeeded');
  assert.equal(ledger.estimatedCost, 0, 'we did not estimate it; the actual cost is what counts');
  assert.equal(ledger.actualCost, 0.198);
});

test('failed, aborted and unfinished runs are recorded without touching deals', async () => {
  const repo = MemoryRepository.empty();
  await seedRunningLedger(repo);
  const failed = await ingestRun({
    repo,
    apifyRunId: 'apify-1',
    cfg,
    client: fakeClient(run({ status: 'FAILED', statusMessage: 'actor exited with code 1' })).client,
    now,
    log: () => undefined,
  });
  assert.equal(failed.ok, false);
  assert.equal((await repo.listDeals()).length, 0);
  assert.equal((await repo.getScrapeRunByApifyId('apify-1'))?.status, 'failed');

  const repo2 = MemoryRepository.empty();
  await seedRunningLedger(repo2);
  const pending = await ingestRun({ repo: repo2, apifyRunId: 'apify-1', cfg, client: fakeClient(run({ status: 'RUNNING' })).client, now, log: () => undefined });
  assert.equal(pending.skipped, 'not_finished');
  assert.equal((await repo2.getScrapeRunByApifyId('apify-1'))?.status, 'running', 'left alone to finish');
});

test('an unknown address is refused rather than guessed at', async () => {
  const repo = MemoryRepository.empty();
  const res = await ingestRun({
    repo,
    apifyRunId: 'apify-x',
    cfg,
    client: fakeClient(run({ id: 'apify-x' })).client,
    fallback: { platform: 'doordash', addressKey: '00000', kind: 'feed' },
    now,
    log: () => undefined,
  });
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /unknown address/);
  assert.equal(await repo.countScrapeRuns(), 0);
});

test('reconcile ingests finished runs, leaves fresh ones alone and gives up on stuck ones', async () => {
  const repo = MemoryRepository.empty();
  await seedRunningLedger(repo);
  const done = await reconcileRuns({ repo, cfg, client: fakeClient(run()).client, now, log: () => undefined });
  assert.deepEqual([done.checked, done.ingested, done.stillRunning, done.failed], [1, 1, 0, 0]);

  const repo2 = MemoryRepository.empty();
  await seedRunningLedger(repo2, { apifyRunId: 'apify-slow' });
  const running = fakeClient(run({ id: 'apify-slow', status: 'RUNNING' })).client;
  const fresh = await reconcileRuns({ repo: repo2, cfg, client: running, now: new Date(now.getTime() + 60_000), log: () => undefined });
  assert.equal(fresh.stillRunning, 1);
  assert.equal((await repo2.getScrapeRunByApifyId('apify-slow'))?.status, 'running');

  const stuck = await reconcileRuns({ repo: repo2, cfg, client: running, now: new Date(now.getTime() + 3 * 3600 * 1000), log: () => undefined });
  assert.equal(stuck.failed, 1);
  assert.equal((await repo2.getScrapeRunByApifyId('apify-slow'))?.status, 'failed');

  const repo3 = MemoryRepository.empty();
  await repo3.createScrapeRun({ platform: 'doordash', addressKey: '15232', kind: 'feed', actorId: 'a', startedAt: now, status: 'queued', estimatedCost: 0.2 });
  const orphan = await reconcileRuns({ repo: repo3, cfg, now: new Date(now.getTime() + 3 * 3600 * 1000), log: () => undefined });
  assert.equal(orphan.failed, 1, 'a row that never reached Apify is closed out');
});
