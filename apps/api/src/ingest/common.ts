/**
 * Shared plumbing for the open-data ingest (`npm run ingest`).
 *
 * Every source here is openly licensed and fetched from a documented public API:
 *   - WPRDC (data.wprdc.org) CKAN datastore — Allegheny County food facilities,
 *     inspections and violations. Allegheny County open data.
 *   - OpenStreetMap Overpass — cuisine, diet, opening hours, contact. ODbL.
 *
 * This deliberately does NOT touch DoorDash / Uber Eats / Grubhub. The platform
 * adapters in src/adapters stay what they already are: a small point-lookup tool
 * for a single zip + dish. Bulk catalogue volume comes from open data instead.
 */
import type { Model } from 'mongoose';
import mongoose from 'mongoose';
import { config } from '../config';

/** WPRDC CKAN datastore resource ids (see docs/DATA_SOURCES.md). */
export const WPRDC = {
  facilities: '112a3821-334d-4f3f-ab40-4de1220b1a0a',
  inspections: '4ea730d8-2bf9-4783-b0a5-b41ed687097e',
  violations: '1a1329e2-418c-4bd3-af2c-cc334e7559af',
  fastFood: '3c530161-2976-41ae-a0f0-7d3e74835049',
} as const;

/** Allegheny County bounding box as [south, west, north, east] — "the Pittsburgh area". */
export const PGH_BBOX = [40.18, -80.37, 40.7, -79.68] as const;

const UA = 'forkcast-hackcmu2026/0.1 (open-data ingest)';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type CkanRow = Record<string, unknown>;

interface Fatal extends Error {
  fatal?: boolean;
}

/** GET + parse JSON with backoff on 429/5xx. 4xx (other than 429) fails fast. */
export async function fetchJson<T>(url: string, init?: RequestInit, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers ?? {}) } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        const e: Fatal = new Error(`HTTP ${res.status} for ${url}`);
        e.fatal = true;
        throw e;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if ((err as Fatal).fatal) throw err;
      await sleep(600 * 2 ** i);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Total row count for a CKAN datastore resource. */
export async function ckanTotal(resourceId: string): Promise<number> {
  const u = `https://data.wprdc.org/api/3/action/datastore_search?resource_id=${resourceId}&limit=0`;
  const body = await fetchJson<{ result: { total: number } }>(u);
  return body.result.total;
}

/** Page through a CKAN datastore resource. Each row carries its stable `_id`. */
export async function* ckanPages(resourceId: string, pageSize = 5000): AsyncGenerator<CkanRow[]> {
  let offset = 0;
  for (;;) {
    const u =
      `https://data.wprdc.org/api/3/action/datastore_search` +
      `?resource_id=${resourceId}&limit=${pageSize}&offset=${offset}`;
    const body = await fetchJson<{ result: { records: CkanRow[]; total: number } }>(u);
    const recs = body.result.records ?? [];
    if (recs.length === 0) return;
    yield recs;
    offset += recs.length;
    if (offset >= body.result.total) return;
    await sleep(150); // polite: WPRDC is a small public server
  }
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Run an Overpass QL query, trying the mirrors in order. */
export async function overpass(query: string): Promise<OverpassElement[]> {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastErr: unknown;
  for (const m of mirrors) {
    try {
      const body = await fetchJson<{ elements: OverpassElement[] }>(m, { method: 'POST', body: query }, 3);
      return body.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Last time each label printed, so a redirected log gets progress but not spam. */
const lastTickAt = new Map<string, number>();

/**
 * Single-line progress on a TTY. When stdout is redirected (`> ingest.log`, CI)
 * a carriage return is useless and printing every chunk floods the file, so
 * throttle to one line per label per 15s. The old behaviour — print only at
 * done >= total — left multi-hour stages looking hung, and made bulkUpsert's
 * per-chunk calls the only thing that ever appeared.
 */
export function tick(label: string, done: number, total: number): void {
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '0.0';
  const line = `[${label}] ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}   `);
    return;
  }
  const now = Date.now();
  if (now - (lastTickAt.get(label) ?? 0) < 15_000) return;
  lastTickAt.set(label, now);
  console.log(line);
}

export function done(label: string, msg: string): void {
  if (process.stdout.isTTY) process.stdout.write('\r');
  console.log(`[${label}] ${msg}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBulkOp = any;

/** Chunked bulkWrite with progress. Returns docs actually inserted/updated. */
export async function bulkUpsert(
  model: Model<never> | Model<Record<string, unknown>>,
  ops: AnyBulkOp[],
  label: string,
  chunk = 2000,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < ops.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (model as any).bulkWrite(ops.slice(i, i + chunk), { ordered: false });
    written += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.insertedCount ?? 0);
    tick(label, Math.min(i + chunk, ops.length), ops.length);
  }
  return written;
}

export async function connect(): Promise<void> {
  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env at the repo root and fill it in.');
  }
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[ingest] connected to ${mongoose.connection.name}`);
}

/** Current logical data size of the connected database, in GB. */
export async function dbSizeGB(): Promise<number> {
  const st = await mongoose.connection.db!.stats();
  return st.dataSize / 1024 ** 3;
}

/** Trim a CKAN string cell: '' and whitespace become undefined. */
export const s = (v: unknown): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return t.length > 0 ? t : undefined;
};

export const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : Number(s(v));
  return Number.isFinite(n) ? n : undefined;
};

export const date = (v: unknown): Date | undefined => {
  const t = s(v);
  if (!t) return undefined;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
