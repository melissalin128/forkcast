/** Webhook and reconcile auth. Ingestion itself is covered in src/deals/ingest.test.ts. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { config } from '../config';
import { setRepo } from '../db';
import { parseDealsConfig, setDealsConfig } from '../deals/config';
import { MemoryRepository } from '../repo/memory';

let server: Server;
let base: string;
const originals = { webhookSecret: config.apify.webhookSecret, cronSecret: config.cronSecret };

before(async () => {
  setDealsConfig(
    parseDealsConfig({
      addresses: [{ key: '15232', label: 'Shadyside', streetAddress: '5500 Walnut St, Pittsburgh, PA 15232', lat: 40.4514, lng: -79.933 }],
      feedQueries: ['pizza'],
      actors: { doordash: { actorId: 'dz_omar/doordash-scraper', pricing: {} } },
    }),
  );
  setRepo(MemoryRepository.empty());
  config.apify.webhookSecret = 'hook-secret';
  config.cronSecret = 'cron-secret';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  setRepo(null);
  setDealsConfig(null);
  config.apify.webhookSecret = originals.webhookSecret;
  config.cronSecret = originals.cronSecret;
});

const postHook = async (query: string, body: unknown) => {
  const res = await fetch(`${base}/api/apify/webhook${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

test('the webhook rejects a missing, wrong or truncated token', async () => {
  const payload = { eventType: 'ACTOR.RUN.SUCCEEDED', eventData: { actorRunId: 'apify-1' } };
  assert.equal((await postHook('?address=15232', payload)).status, 401);
  assert.equal((await postHook('?address=15232&token=wrong-secret', payload)).status, 401);
  assert.equal((await postHook('?address=15232&token=hook', payload)).status, 401, 'a prefix is not enough');
});

test('an authenticated webhook with no run id in the payload is a 400', async () => {
  const res = await postHook('?address=15232&token=hook-secret', { eventType: 'ACTOR.RUN.SUCCEEDED' });
  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /no actor run id/);
});

test('an unknown address in the webhook query is rejected', async () => {
  const res = await postHook('?address=00000&token=hook-secret', { eventData: { actorRunId: 'apify-1' } });
  assert.equal(res.status, 400);
});

test('reconcile needs the cron bearer token', async () => {
  const noAuth = await fetch(`${base}/api/apify/reconcile`);
  assert.equal(noAuth.status, 401);
  const wrong = await fetch(`${base}/api/apify/reconcile`, { headers: { authorization: 'Bearer nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  const ok = await fetch(`${base}/api/apify/reconcile`, { headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { checked: 0, ingested: 0, stillRunning: 0, failed: 0 });
});
