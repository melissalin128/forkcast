import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryRepository } from '../repo/memory';
import type { ApifyClient } from './apify';
import { buildWebhookUrl, startFeedJob, startSearchJob, webhooksFor } from './jobs';
import { parseDealsConfig } from './config';

const now = new Date('2026-09-12T17:30:00Z');

const cfg = parseDealsConfig({
  addresses: [{ key: '15232', label: 'Shadyside', streetAddress: '5500 Walnut St, Pittsburgh, PA 15232', lat: 40.4514, lng: -79.933 }],
  feedQueries: ['pizza', 'sushi', 'chinese', 'burgers', 'indian', 'thai'],
  caps: { feedRunsPerDay: 4, searchesPerDay: 10, maxResultsPerRun: 36, spendCeilingUsd: 5 },
  actors: { doordash: { actorId: 'dz_omar/doordash-scraper', pricing: { perResultUsd: 0.006 }, input: { includeMenu: true } } },
});

interface StartCall {
  actorId: string;
  input: Record<string, unknown>;
  opts: Record<string, unknown>;
}

function fakeClient(over: Partial<ApifyClient> = {}): { client: ApifyClient; starts: StartCall[] } {
  const starts: StartCall[] = [];
  const client = {
    async startRun(actorId: string, input: Record<string, unknown>, opts: Record<string, unknown>) {
      starts.push({ actorId, input, opts });
      return { id: 'apify-run-1', actId: actorId, status: 'RUNNING', defaultDatasetId: 'ds-1' };
    },
    ...over,
  } as unknown as ApifyClient;
  return { client, starts };
}

test('a feed job writes the ledger row, starts the actor and records the Apify run id', async () => {
  const repo = MemoryRepository.empty();
  const { client, starts } = fakeClient();
  const res = await startFeedJob({ repo, addressKey: '15232', cfg, client, now, log: () => undefined });

  assert.equal(res.started, true);
  assert.ok(res.started);
  assert.equal(res.apifyRunId, 'apify-run-1');
  assert.equal(res.estimatedCost, 0.216, '36 results x $0.006');

  assert.equal(starts.length, 1);
  assert.equal(starts[0].actorId, 'dz_omar/doordash-scraper');
  assert.equal((starts[0].input.startUrls as unknown[]).length, 6);
  assert.equal(starts[0].input.maxResults, 6, 'per URL');
  assert.equal(starts[0].opts.maxItems, 36, 'hard dataset cap on the run itself');

  const [run] = await repo.listScrapeRuns();
  assert.equal(run.status, 'running');
  assert.equal(run.apifyRunId, 'apify-run-1');
  assert.equal(run.datasetId, 'ds-1');
  assert.equal(run.kind, 'feed');
  assert.equal(run.query, 'pizza, sushi, chinese, burgers, indian, thai');
  assert.equal(run.estimatedCost, 0.216);
});

test('a search job carries the user query and one URL', async () => {
  const repo = MemoryRepository.empty();
  const { client, starts } = fakeClient();
  const res = await startSearchJob({ repo, addressKey: '15232', query: '  Primanti Bros ', cfg, client, now, log: () => undefined });
  assert.ok(res.started);
  assert.equal((starts[0].input.startUrls as Array<{ url: string }>)[0].url, 'https://www.doordash.com/search/store/Primanti%20Bros?event_type=search');
  const [run] = await repo.listScrapeRuns();
  assert.equal(run.kind, 'search');
  assert.equal(run.query, 'Primanti Bros');
});

test('the cost guard stops a job before the actor is ever called', async () => {
  const repo = MemoryRepository.empty();
  const { client, starts } = fakeClient();
  for (let i = 0; i < 4; i += 1) {
    await repo.createScrapeRun({
      platform: 'doordash', addressKey: '15232', kind: 'feed', actorId: 'a',
      startedAt: new Date(now.getTime() - (i + 1) * 3600 * 1000), status: 'succeeded', estimatedCost: 0.216,
    });
  }
  const res = await startFeedJob({ repo, addressKey: '15232', cfg, client, now, log: () => undefined });
  assert.equal(res.started, false);
  assert.equal(!res.started && res.code, 'feed_cap');
  assert.equal(starts.length, 0, 'nothing was sent to Apify');
  assert.ok(!res.started && res.run?.status === 'skipped', 'the refusal is in the ledger');
  assert.ok(!res.started && res.input, 'the input we would have sent is still reported, for debugging');
});

test('a dry run reports the input and the estimate without starting or writing a run', async () => {
  const repo = MemoryRepository.empty();
  const { client, starts } = fakeClient();
  const lines: string[] = [];
  const res = await startFeedJob({ repo, addressKey: '15232', cfg, client, now, dryRun: true, log: (l) => lines.push(l) });
  assert.equal(!res.started && res.code, 'dry_run');
  assert.equal(starts.length, 0);
  assert.equal(await repo.countScrapeRuns(), 0);
  assert.ok(lines.some((l) => l.includes('would start')));
});

test('an unconfigured address or platform refuses without touching the ledger', async () => {
  const repo = MemoryRepository.empty();
  const { client } = fakeClient();
  const bad = await startFeedJob({ repo, addressKey: '99999', cfg, client, now, log: () => undefined });
  assert.equal(!bad.started && bad.code, 'not_configured');
  const noActor = await startFeedJob({ repo, addressKey: '15232', platform: 'grubhub', cfg, client, now, log: () => undefined });
  assert.equal(!noActor.started && noActor.code, 'not_configured');
  assert.match(!noActor.started ? noActor.reason : '', /no actor id configured for grubhub/);
  assert.equal(await repo.countScrapeRuns(), 0);
});

test('an Apify failure marks the ledger row failed instead of leaving it running forever', async () => {
  const repo = MemoryRepository.empty();
  const { client } = fakeClient({
    startRun: async () => {
      throw new Error('POST /v2/acts/x/runs -> 402: monthly usage hard limit exceeded');
    },
  } as Partial<ApifyClient>);
  const res = await startFeedJob({ repo, addressKey: '15232', cfg, client, now, log: () => undefined });
  assert.equal(!res.started && res.code, 'apify_error');
  const [run] = await repo.listScrapeRuns();
  assert.equal(run.status, 'failed');
  assert.match(run.error ?? '', /hard limit/);
});

test('webhook URLs carry platform, address, kind and the shared secret', () => {
  const url = buildWebhookUrl('feed', 'doordash', '15232', 'https://forkcast-api.vercel.app/', 'shhh');
  assert.equal(url, 'https://forkcast-api.vercel.app/api/apify/webhook?platform=doordash&address=15232&kind=feed&token=shhh');
  assert.equal(buildWebhookUrl('search', 'doordash', '15232', undefined, 'shhh'), undefined, 'no base URL configured -> no webhook');
  assert.deepEqual(webhooksFor('feed', 'doordash', '15232', 'https://x.test', 's')[0].eventTypes, [
    'ACTOR.RUN.SUCCEEDED',
    'ACTOR.RUN.FAILED',
    'ACTOR.RUN.ABORTED',
    'ACTOR.RUN.TIMED_OUT',
  ]);
});
