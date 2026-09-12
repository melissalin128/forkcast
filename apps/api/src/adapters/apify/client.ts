/**
 * Minimal Apify REST client (no SDK dependency — Node 18+ `fetch` is enough).
 *
 * Two ways to run an actor:
 *
 *   sync  POST /v2/acts/<actorId>/run-sync-get-dataset-items
 *         Starts the run, waits, returns the dataset rows in the response.
 *         Apify caps this at 300 s of wall time, so it suits search actors.
 *
 *   async POST /v2/acts/<actorId>/runs  -> poll GET /v2/actor-runs/<runId>
 *         -> GET /v2/datasets/<defaultDatasetId>/items
 *         Used when the configured timeout is over the sync cap (APIFY_TIMEOUT_SEC)
 *         or APIFY_ASYNC=1.
 *
 * Actor ids are `username/actor-name` in the UI and `username~actor-name` in the
 * API path; `toActorPath` accepts either, plus the raw actor id.
 */

/** The actor run finished as FAILED/TIMED-OUT/ABORTED, or Apify rejected the call. */
export class ApifyError extends Error {
  readonly status: number;
  constructor(
    message: string,
    status = 502,
    readonly actorId?: string,
  ) {
    super(message);
    this.name = 'ApifyError';
    this.status = status;
  }
}

export interface ApifyClientOptions {
  token: string;
  /** Seconds an actor run may take before we give up. */
  timeoutSec?: number;
  /** Force the async run + poll path even below the 300 s sync cap. */
  async?: boolean;
  /** Actor memory in MB; leave undefined to use the actor's default. */
  memoryMbytes?: number;
  baseUrl?: string;
  log?: (line: string) => void;
}

export interface RunActorOptions {
  /** Cap on dataset rows pulled back (also passed to the run as `maxItems`). */
  maxItems?: number;
  /** Per-call override of the client timeout. */
  timeoutSec?: number;
}

const SYNC_CAP_SEC = 300;
const POLL_MS = 3000;
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMING-OUT']);

export const toActorPath = (actorId: string): string => actorId.trim().replace(/\//g, '~');

export class ApifyClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutSec: number;
  private readonly forceAsync: boolean;
  private readonly memoryMbytes?: number;
  private readonly log: (line: string) => void;

  constructor(opts: ApifyClientOptions) {
    if (!opts.token) throw new ApifyError('APIFY_TOKEN is not set', 500);
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl ?? 'https://api.apify.com').replace(/\/$/, '');
    this.timeoutSec = Math.max(30, opts.timeoutSec ?? 180);
    this.forceAsync = opts.async ?? false;
    this.memoryMbytes = opts.memoryMbytes;
    this.log = opts.log ?? (() => undefined);
  }

  /** Run an actor and return its default dataset rows. */
  async run<T = Record<string, unknown>>(actorId: string, input: unknown, opts: RunActorOptions = {}): Promise<T[]> {
    const timeoutSec = Math.max(30, opts.timeoutSec ?? this.timeoutSec);
    const started = Date.now();
    const items =
      this.forceAsync || timeoutSec > SYNC_CAP_SEC
        ? await this.runAsync<T>(actorId, input, timeoutSec, opts.maxItems)
        : await this.runSync<T>(actorId, input, timeoutSec, opts.maxItems);
    this.log(`[apify] ${actorId}: ${items.length} items in ${Math.round((Date.now() - started) / 1000)}s`);
    return items;
  }

  private async runSync<T>(actorId: string, input: unknown, timeoutSec: number, maxItems?: number): Promise<T[]> {
    const qs = new URLSearchParams({ timeout: String(Math.min(timeoutSec, SYNC_CAP_SEC)), format: 'json' });
    if (maxItems) qs.set('maxItems', String(maxItems));
    if (this.memoryMbytes) qs.set('memory', String(this.memoryMbytes));
    const res = await this.fetch(`/v2/acts/${toActorPath(actorId)}/run-sync-get-dataset-items?${qs}`, {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
      // +20s so the HTTP abort never beats Apify's own run timeout to the punch.
      signalTimeoutMs: (Math.min(timeoutSec, SYNC_CAP_SEC) + 20) * 1000,
      actorId,
    });
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new ApifyError(`${actorId}: expected a dataset array, got ${typeof body}`, 502, actorId);
    return body as T[];
  }

  private async runAsync<T>(actorId: string, input: unknown, timeoutSec: number, maxItems?: number): Promise<T[]> {
    const qs = new URLSearchParams({ timeout: String(timeoutSec) });
    if (this.memoryMbytes) qs.set('memory', String(this.memoryMbytes));
    const startRes = await this.fetch(`/v2/acts/${toActorPath(actorId)}/runs?${qs}`, {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
      signalTimeoutMs: 60_000,
      actorId,
    });
    const run = ((await startRes.json()) as { data?: RunData }).data;
    if (!run?.id) throw new ApifyError(`${actorId}: run did not start`, 502, actorId);

    const deadline = Date.now() + timeoutSec * 1000;
    let status = run.status;
    let datasetId = run.defaultDatasetId;
    while (!TERMINAL.has(status)) {
      if (Date.now() > deadline) {
        await this.abort(run.id);
        throw new ApifyError(`${actorId}: run ${run.id} exceeded ${timeoutSec}s`, 504, actorId);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      const pollRes = await this.fetch(`/v2/actor-runs/${run.id}`, { method: 'GET', signalTimeoutMs: 30_000, actorId });
      const data = ((await pollRes.json()) as { data?: RunData }).data;
      status = data?.status ?? status;
      datasetId = data?.defaultDatasetId ?? datasetId;
    }
    if (status !== 'SUCCEEDED') {
      throw new ApifyError(`${actorId}: run ${run.id} ended ${status} (see https://console.apify.com/actors/runs/${run.id})`, 502, actorId);
    }
    if (!datasetId) throw new ApifyError(`${actorId}: run ${run.id} has no dataset`, 502, actorId);

    const itemQs = new URLSearchParams({ format: 'json', clean: 'true' });
    if (maxItems) itemQs.set('limit', String(maxItems));
    const itemsRes = await this.fetch(`/v2/datasets/${datasetId}/items?${itemQs}`, { method: 'GET', signalTimeoutMs: 60_000, actorId });
    const body = (await itemsRes.json()) as unknown;
    return Array.isArray(body) ? (body as T[]) : [];
  }

  private async abort(runId: string): Promise<void> {
    await this.fetch(`/v2/actor-runs/${runId}/abort`, { method: 'POST', signalTimeoutMs: 15_000 }).catch(() => undefined);
  }

  private async fetch(
    path: string,
    opts: { method: string; body?: string; signalTimeoutMs: number; actorId?: string },
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body,
        signal: AbortSignal.timeout(opts.signalTimeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApifyError(`${opts.actorId ?? 'apify'}: request failed (${msg})`, 504, opts.actorId);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const hint =
        res.status === 401 || res.status === 403
          ? ' — check APIFY_TOKEN'
          : res.status === 404
            ? ' — check the actor id (it is `username/actor-name` on the store page)'
            : res.status === 402
              ? ' — Apify account is out of credit'
              : '';
      throw new ApifyError(`${opts.actorId ?? 'apify'}: HTTP ${res.status}${hint}: ${detail}`, res.status, opts.actorId);
    }
    return res;
  }
}

interface RunData {
  id: string;
  status: string;
  defaultDatasetId?: string;
}
