import { mockHistory, REFRESHED_AT, RESTAURANTS } from '../data/mock';
import type { PriceSnapshot, Restaurant, RestaurantsResponse } from '../types';

/**
 * Thin client for apps/api. Every call first tries the real API (Vite proxies
 * `/api` -> http://localhost:4000 in dev) and falls back to the in-memory mock
 * when the request fails, times out, or returns something that is not JSON
 * (e.g. `vite preview` answering `/api/*` with index.html).
 */

export type Source = 'api' | 'mock';
export interface Sourced<T> {
  data: T;
  source: Source;
}

const TIMEOUT_MS = 2500;

async function tryJson<T>(url: string, validate: (json: unknown) => json is T): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const json: unknown = await res.json();
    return validate(json) ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isRestaurant(v: unknown): v is Restaurant {
  return isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.offers);
}

function isRestaurantsResponse(v: unknown): v is RestaurantsResponse | Restaurant[] {
  if (Array.isArray(v)) return v.every(isRestaurant);
  return isObject(v) && Array.isArray(v.restaurants) && v.restaurants.every(isRestaurant);
}

function isSnapshotList(v: unknown): v is PriceSnapshot[] | { snapshots: PriceSnapshot[] } {
  const rows = Array.isArray(v) ? v : isObject(v) && Array.isArray(v.snapshots) ? v.snapshots : null;
  return (
    rows !== null &&
    rows.every(
      (s) => isObject(s) && typeof s.total === 'number' && typeof s.capturedAt === 'string',
    )
  );
}

function filterMock(zip: string, q: string): Restaurant[] {
  const needle = q.trim().toLowerCase();
  return RESTAURANTS.filter((r) => r.location.zip === zip || zip === '').filter((r) => {
    if (!needle) return true;
    const hay = [r.name, ...r.cuisine, ...r.dietaryTags, ...r.order.map((o) => o.name)]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

export async function getRestaurants(zip: string, q = ''): Promise<Sourced<RestaurantsResponse>> {
  const params = new URLSearchParams({ zip });
  if (q.trim()) params.set('q', q.trim());
  const json = await tryJson(`/api/restaurants?${params}`, isRestaurantsResponse);
  if (json) {
    const data: RestaurantsResponse = Array.isArray(json)
      ? { restaurants: json, refreshedAt: new Date().toISOString() }
      : json;
    return { data, source: 'api' };
  }
  return { data: { restaurants: filterMock(zip, q), refreshedAt: REFRESHED_AT }, source: 'mock' };
}

export async function getRestaurant(id: string): Promise<Sourced<Restaurant | undefined>> {
  const json = await tryJson(`/api/restaurants/${encodeURIComponent(id)}`, isRestaurant);
  if (json) return { data: json, source: 'api' };
  return { data: RESTAURANTS.find((r) => r.id === id), source: 'mock' };
}

export async function getHistory(id: string): Promise<Sourced<PriceSnapshot[]>> {
  const json = await tryJson(`/api/restaurants/${encodeURIComponent(id)}/history`, isSnapshotList);
  if (json) return { data: Array.isArray(json) ? json : json.snapshots, source: 'api' };
  return { data: mockHistory(id), source: 'mock' };
}
