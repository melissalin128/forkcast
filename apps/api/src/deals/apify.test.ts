import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApifyClient, ApifyError, actorPath, encodeWebhooks } from './apify';

interface Call {
  url: URL;
  init: RequestInit;
}

function fakeFetch(handler: (call: Call) => { status?: number; body?: unknown }): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init: init ?? {} };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: f, calls };
}

const headersOf = (c: Call): Record<string, string> => c.init.headers as Record<string, string>;

test('actorPath turns username/name into username~name and leaves ids alone', () => {
  assert.equal(actorPath('abotapi/doordash-scraper'), 'abotapi~doordash-scraper');
  assert.equal(actorPath('QJciV7tNisa2BjcJQ'), 'QJciV7tNisa2BjcJQ');
});

test('startRun posts the input with the token in a header, and run options + webhooks in the query', async () => {
  const run = { id: 'run1', actId: 'act1', status: 'RUNNING', defaultDatasetId: 'ds1' };
  const { fetch, calls } = fakeFetch(() => ({ status: 201, body: { data: run } }));
  const client = new ApifyClient({ token: 'secret-token', fetch });
  const webhooks = [{ eventTypes: ['ACTOR.RUN.SUCCEEDED'], requestUrl: 'https://api.example/api/apify/webhook?token=w' }];
  const out = await client.startRun('abotapi/doordash-scraper', { search: ['pizza'] }, { maxItems: 20, timeoutSecs: 600, memoryMbytes: 1024, webhooks });

  assert.deepEqual(out, run);
  const [c] = calls;
  assert.equal(c.init.method, 'POST');
  assert.equal(c.url.pathname, '/v2/acts/abotapi~doordash-scraper/runs');
  assert.equal(c.url.searchParams.get('maxItems'), '20');
  assert.equal(c.url.searchParams.get('timeout'), '600');
  assert.equal(c.url.searchParams.get('memory'), '1024');
  assert.equal(c.url.searchParams.get('webhooks'), encodeWebhooks(webhooks));
  assert.equal(headersOf(c).Authorization, 'Bearer secret-token');
  assert.equal(c.url.searchParams.get('token'), null, 'token never goes in the URL');
  assert.deepEqual(JSON.parse(String(c.init.body)), { search: ['pizza'] });
});

test('getRun and getDatasetItems hit the right endpoints; items page until the limit', async () => {
  const { fetch, calls } = fakeFetch((c) => {
    if (c.url.pathname === '/v2/actor-runs/run1') return { body: { data: { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'ds1', usageTotalUsd: 0.11 } } };
    if (c.url.pathname === '/v2/datasets/ds1/items') {
      const offset = Number(c.url.searchParams.get('offset'));
      const limit = Number(c.url.searchParams.get('limit'));
      return { body: Array.from({ length: Math.min(limit, 1500 - offset) }, (_, i) => ({ i: offset + i })) };
    }
    return { status: 404, body: { error: { type: 'record-not-found', message: 'nope' } } };
  });
  const client = new ApifyClient({ token: 't', fetch });
  const run = await client.getRun('run1');
  assert.equal(run.usageTotalUsd, 0.11);

  const items = await client.getDatasetItems('ds1', { limit: 1200 });
  assert.equal(items.length, 1200);
  const pages = calls.filter((c) => c.url.pathname.includes('/datasets/'));
  assert.equal(pages.length, 2, 'two pages: 1000 then 200');
  assert.equal(pages[1].url.searchParams.get('offset'), '1000');
  assert.equal(pages[0].url.searchParams.get('clean'), 'true');

  const small = await client.getDatasetItems('ds1', { limit: 5 });
  assert.equal(small.length, 5);
});

test('waitForRun polls until a terminal status', async () => {
  const statuses = ['READY', 'RUNNING', 'RUNNING', 'SUCCEEDED'];
  let i = 0;
  const { fetch } = fakeFetch(() => ({ body: { data: { id: 'run1', status: statuses[i++], defaultDatasetId: 'ds1' } } }));
  const slept: number[] = [];
  const client = new ApifyClient({ token: 't', fetch, sleep: async (ms) => void slept.push(ms) });
  const run = await client.waitForRun('run1', { pollMs: 10 });
  assert.equal(run.status, 'SUCCEEDED');
  assert.deepEqual(slept, [10, 10, 10]);
});

test('non-2xx responses become ApifyError with the API message and no token', async () => {
  const { fetch } = fakeFetch(() => ({ status: 401, body: { error: { type: 'token-not-found', message: 'Authentication token is not valid' } } }));
  const client = new ApifyClient({ token: 'super-secret', fetch });
  await assert.rejects(client.getRun('x'), (err: unknown) => {
    assert.ok(err instanceof ApifyError);
    assert.equal(err.status, 401);
    assert.equal(err.type, 'token-not-found');
    assert.ok(!err.message.includes('super-secret'));
    return true;
  });
});

test('a missing token fails fast at construction', () => {
  assert.throws(() => new ApifyClient({ token: '' }), /APIFY_API_KEY/);
});
