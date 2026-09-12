import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DEALS_CONFIG_PATH, actorFor, estimateRunCost, findAddress, loadDealsConfig, parseDealsConfig } from './config';

test('the checked-in deals.config.json validates', () => {
  const cfg = loadDealsConfig(DEFAULT_DEALS_CONFIG_PATH);
  assert.ok(findAddress(cfg, '15232'), 'first address is 15232');
  assert.deepEqual(cfg.feedQueries, ['pizza', 'sushi', 'chinese', 'burgers', 'indian', 'thai']);
  assert.equal(cfg.caps.feedRunsPerDay, 4);
  assert.equal(cfg.caps.searchesPerDay, 10);
  assert.equal(cfg.caps.spendCeilingUsd, 5);
  // no actor id wired yet -> actorFor() says "not configured" instead of returning a blank id
  assert.equal(actorFor(cfg, 'grubhub'), undefined);
});

test('a minimal config gets defaults for caps, weights and actors', () => {
  const cfg = parseDealsConfig({
    addresses: [{ key: 'a', label: 'A', lat: 1, lng: 2 }],
    feedQueries: ['pizza'],
    actors: { doordash: { actorId: 'user/actor', pricing: { perRunUsd: 0.08, perResultUsd: 0.002 } } },
  });
  assert.equal(cfg.addresses[0].radiusMi, 3);
  assert.equal(cfg.caps.maxResultsPerRun, 40);
  assert.equal(cfg.caps.staleAfterHours, 36);
  assert.equal(cfg.scoreWeights.defaultSavingsByType.bogo, 8);
  const actor = actorFor(cfg, 'doordash');
  assert.ok(actor);
  assert.equal(actor.timeoutSecs, 600);
  assert.equal(estimateRunCost(actor, 20), 0.12);
});

test('invalid config is rejected with a clear error', () => {
  assert.throws(() => parseDealsConfig({ addresses: [], feedQueries: [], actors: {} }));
});
