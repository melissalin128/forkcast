/**
 * Minimal Apify v2 REST client on Node's built-in fetch (no SDK dependency).
 * The token travels in the Authorization header, never in URLs, so nothing
 * that gets logged or thrown can leak it.
 *
 *   startRun(actorId, input, { maxItems, webhooks })  POST /acts/{id}/runs
 *   getRun(runId)                                     GET  /actor-runs/{id}
 *   waitForRun(runId)                                 poll getRun until terminal (CLI only)
 *   getDatasetItems(datasetId, { limit })             GET  /datasets/{id}/items
 */
import { config } from '../config';

export const APIFY_BASE_URL = 'https://api.apify.com/v2';

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMING-OUT'
  | 'TIMED-OUT'
  | 'ABORTING'
  | 'ABORTED';

export const TERMINAL_RUN_STATUSES: readonly ApifyRunStatus[] = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];
export const isTerminalRunStatus = (s: string): s is ApifyRunStatus => (TERMINAL_RUN_STATUSES as readonly string[]).includes(s);

/** The parts of an Apify run object we use. */
export interface ApifyRun {
  id: string;
  actId: string;
  status: ApifyRunStatus;
  startedAt?: string;
  finishedAt?: string;
  defaultDatasetId: string;
  defaultKeyValueStoreId?: string;
  /** Total usage in USD, present once the run has been billed (may lag a few seconds after finishing). */
  usageTotalUsd?: number;
  statusMessage?: string;
  /** Actor input as Apify recorded it (only when the run is fetched with the default fields). */
  options?: { build?: string; memoryMbytes?: number; timeoutSecs?: number };
}

export interface ApifyWebhook {
  /** e.g. ACTOR.RUN.SUCCEEDED, ACTOR.RUN.FAILED, ACTOR.RUN.ABORTED, ACTOR.RUN.TIMED_OUT */
  eventTypes: string[];
  requestUrl: string;
  payloadTemplate?: string;
}

export const RUN_FINISHED_EVENT_TYPES = ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'];

export interface StartRunOptions {
  /** Apify stops the run once the default dataset holds this many items (pay-per-result actors bill accordingly). */
  maxItems?: number;
  memoryMbytes?: number;
  timeoutSecs?: number;
  webhooks?: ApifyWebhook[];
}

export class ApifyError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly type?: string,
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

export interface ApifyClientOptions {
  token?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** "username/name" -> "username~name" as the REST API wants it; bare ids pass through. */
export const actorPath = (actorId: string): string => actorId.replace('/', '~');

export const encodeWebhooks = (webhooks: ApifyWebhook[]): string => Buffer.from(JSON.stringify(webhooks), 'utf8').toString('base64');

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ApifyClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ApifyClientOptions = {}) {
    const token = opts.token ?? config.dealsApify.token;
    if (!token) throw new Error('APIFY_API_KEY is not set (see .env.example)');
    this.token = token;
    this.baseUrl = (opts.baseUrl ?? APIFY_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async startRun(actorId: string, input: Record<string, unknown>, opts: StartRunOptions = {}): Promise<ApifyRun> {
    const query: Record<string, string> = {};
    if (opts.maxItems !== undefined) query.maxItems = String(opts.maxItems);
    if (opts.memoryMbytes !== undefined) query.memory = String(opts.memoryMbytes);
    if (opts.timeoutSecs !== undefined) query.timeout = String(opts.timeoutSecs);
    if (opts.webhooks && opts.webhooks.length > 0) query.webhooks = encodeWebhooks(opts.webhooks);
    const data = await this.request<{ data: ApifyRun }>('POST', `/acts/${actorPath(actorId)}/runs`, { query, body: input });
    return data.data;
  }

  async getRun(runId: string): Promise<ApifyRun> {
    const data = await this.request<{ data: ApifyRun }>('GET', `/actor-runs/${encodeURIComponent(runId)}`);
    return data.data;
  }

  async abortRun(runId: string): Promise<ApifyRun> {
    const data = await this.request<{ data: ApifyRun }>('POST', `/actor-runs/${encodeURIComponent(runId)}/abort`);
    return data.data;
  }

  /** Poll until the run reaches a terminal status. For the CLI; serverless code uses the webhook instead. */
  async waitForRun(runId: string, opts: { pollMs?: number; timeoutMs?: number; onPoll?: (run: ApifyRun) => void } = {}): Promise<ApifyRun> {
    const pollMs = opts.pollMs ?? 5000;
    const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60 * 1000);
    for (;;) {
      const run = await this.getRun(runId);
      opts.onPoll?.(run);
      if (isTerminalRunStatus(run.status)) return run;
      if (Date.now() >= deadline) throw new ApifyError(408, `run ${runId} still ${run.status} after ${opts.timeoutMs ?? 900000} ms`);
      await this.sleep(pollMs);
    }
  }

  /** Read up to `limit` items (default 1000) from a dataset, paging 1000 at a time. */
  async getDatasetItems(datasetId: string, opts: { limit?: number; offset?: number } = {}): Promise<unknown[]> {
    const limit = opts.limit ?? 1000;
    const out: unknown[] = [];
    let offset = opts.offset ?? 0;
    while (out.length < limit) {
      const page = Math.min(1000, limit - out.length);
      const items = await this.request<unknown[]>('GET', `/datasets/${encodeURIComponent(datasetId)}/items`, {
        query: { offset: String(offset), limit: String(page), clean: 'true' },
      });
      out.push(...items);
      if (items.length < page) break;
      offset += items.length;
    }
    return out;
  }

  /** Actor metadata (pricing, default build) for the read-only actor review in Step 2. */
  async getActor(actorId: string): Promise<Record<string, unknown>> {
    const data = await this.request<{ data: Record<string, unknown> }>('GET', `/acts/${actorPath(actorId)}`);
    return data.data;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch (err) {
      throw new ApifyError(0, `${method} ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await res.text();
    if (!res.ok) {
      let type: string | undefined;
      let message = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text) as { error?: { type?: string; message?: string } };
        type = parsed.error?.type;
        message = parsed.error?.message ?? message;
      } catch {
        // not JSON, keep the raw snippet
      }
      throw new ApifyError(res.status, `${method} ${url.pathname} -> ${res.status}: ${message}`, type);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

let cached: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  cached ??= new ApifyClient();
  return cached;
}

/** Test hook. */
export function setApifyClient(client: ApifyClient | null): void {
  cached = client;
}
