import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewScrapeRun } from '../models/types';
import { MemoryRepository } from '../repo/memory';
import { parseDealsConfig } from './config';
import { checkCostGuard, guardOrSkip, type GuardRequest } from './costGuard';

const now = new Date('2026-09-12T18:00:00Z');
const hoursAgo = (h: number): Date => new Date(now.getTime() - h * 3600 * 1000);

const cfg = parseDealsConfig({
  addresses: [{ key: '15232', label: 'Shadyside', lat: 40.45, lng: -79.93 }],
  feedQueries: ['pizza'],
  caps: { feedRunsPerDay: 2, searchesPerDay: 3, searchCooldownHours: 0, maxResultsPerRun: 40, spendCeilingUsd: 1 },
  actors: { doordash: { actorId: 'u/a', pricing: { perRunUsd: 0.08, perResultUsd: 0.002 } } },
});

const req = (over: Partial<GuardRequest> = {}): GuardRequest => ({
  platform: 'doordash',
  addressKey: '15232',
  kind: 'feed',
  actorId: 'u/a',
  maxResults: 20,
  estimatedCost: 0.12,
  now,
  ...over,
});

const run = (over: Partial<NewScrapeRun> = {}): NewScrapeRun => ({
  platform: 'doordash',
  addressKey: '15232',
  kind: 'feed',
  actorId: 'u/a',
  startedAt: hoursAgo(1),
  status: 'succeeded',
  estimatedCost: 0.12,
  ...over,
});

test('an empty ledger allows a run within caps', async () => {
  const repo = MemoryRepository.empty();
  const v = await checkCostGuard(repo, cfg, req());
  assert.deepEqual(v, { allowed: true, spentSoFar: 0, estimatedCost: 0.12 });
});

test('results above caps.maxResultsPerRun are refused before anything else', async () => {
  const repo = MemoryRepository.empty();
  const v = await checkCostGuard(repo, cfg, req({ maxResults: 41 }));
  assert.equal(v.allowed, false);
  assert.equal(!v.allowed && v.code, 'results_cap');
});

test('the spend ceiling uses actual cost when known and the estimate otherwise', async () => {
  const repo = MemoryRepository.empty();
  await repo.createScrapeRun(run({ startedAt: hoursAgo(30), estimatedCost: 0.5, actualCost: 0.45 }));
  await repo.createScrapeRun(run({ startedAt: hoursAgo(28), estimatedCost: 0.4 }));
  await repo.createScrapeRun(run({ status: 'skipped', estimatedCost: 9 }));
  // 0.45 + 0.40 = 0.85 spent; +0.12 = 0.97 fits under $1
  assert.equal((await checkCostGuard(repo, cfg, req())).allowed, true);
  const v = await checkCostGuard(repo, cfg, req({ estimatedCost: 0.2 }));
  assert.equal(v.allowed, false);
  assert.equal(!v.allowed && v.code, 'spend_ceiling');
  assert.ok(!v.allowed && v.reason.includes('$0.85'));
});

test('feed cap counts runs for that platform in the last 24h, ignoring skipped rows and older runs', async () => {
  const repo = MemoryRepository.empty();
  await repo.createScrapeRun(run({ startedAt: hoursAgo(25) }));
  await repo.createScrapeRun(run({ startedAt: hoursAgo(2), status: 'skipped' }));
  await repo.createScrapeRun(run({ startedAt: hoursAgo(2), status: 'failed' }));
  assert.equal((await checkCostGuard(repo, cfg, req())).allowed, true, '1 counted run < cap 2');
  await repo.createScrapeRun(run({ startedAt: hoursAgo(3) }));
  const v = await checkCostGuard(repo, cfg, req());
  assert.equal(!v.allowed && v.code, 'feed_cap');
  // searches are a separate budget
  assert.equal((await checkCostGuard(repo, cfg, req({ kind: 'search', query: 'ramen' }))).allowed, true);
});

test('search cap and cooldown', async () => {
  const repo = MemoryRepository.empty();
  for (let i = 0; i < 3; i += 1) await repo.createScrapeRun(run({ kind: 'search', query: `q${i}`, startedAt: hoursAgo(i + 1) }));
  const capped = await checkCostGuard(repo, cfg, req({ kind: 'search', query: 'ramen' }));
  assert.equal(!capped.allowed && capped.code, 'search_cap');

  const cooled = parseDealsConfig({ ...cfg, caps: { ...cfg.caps, searchesPerDay: 10, searchCooldownHours: 6 } });
  const repeat = await checkCostGuard(repo, cooled, req({ kind: 'search', query: 'q0' }));
  assert.equal(!repeat.allowed && repeat.code, 'cooldown');
  assert.equal((await checkCostGuard(repo, cooled, req({ kind: 'search', query: 'ramen' }))).allowed, true);
  // with cooldown 0 (the configured default) the same query may run again
  assert.equal((await checkCostGuard(repo, { ...cfg, caps: { ...cfg.caps, searchesPerDay: 10 } }, req({ kind: 'search', query: 'q0' }))).allowed, true);
});

test('an identical run still in flight is reused instead of paid for twice, and is not written as skipped', async () => {
  const repo = MemoryRepository.empty();
  const running = await repo.createScrapeRun(run({ kind: 'search', query: 'ramen', status: 'running', apifyRunId: 'apify-9' }));
  const v = await guardOrSkip(repo, cfg, req({ kind: 'search', query: 'ramen' }), () => undefined);
  assert.equal(v.allowed, false);
  assert.equal(!v.allowed && v.code, 'in_flight');
  assert.equal(!v.allowed && v.existingRunId, running.id);
  assert.equal(await repo.countScrapeRuns({ status: 'skipped' }), 0);
  // a different query is fine
  assert.equal((await checkCostGuard(repo, cfg, req({ kind: 'search', query: 'pho' }))).allowed, true);
});

test('guardOrSkip records cap refusals as skipped ScrapeRuns with the reason', async () => {
  const repo = MemoryRepository.empty();
  const lines: string[] = [];
  const v = await guardOrSkip(repo, cfg, req({ maxResults: 99 }), (l) => lines.push(l));
  assert.equal(v.allowed, false);
  const skipped = await repo.listScrapeRuns({ status: 'skipped' });
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].id, !v.allowed ? v.scrapeRunId : undefined);
  assert.match(skipped[0].error ?? '', /^results_cap: /);
  assert.equal(skipped[0].finishedAt?.getTime(), now.getTime());
  assert.equal(lines.length, 1);
  assert.match(lines[0], /cost guard refused feed run/);
  // the skipped row never counts as spend
  assert.equal(await repo.sumScrapeRunCost(), 0);
});
