import { mockHistory, REFRESHED_AT, RESTAURANTS } from '../data/mock';
import type { PlatformSlug, PriceSnapshot, Promo, Restaurant, RestaurantsResponse } from '../types';

export interface PromosResponse {
  now: string;
  count: number;
  promos: Array<Promo & { id?: string; description?: string | null; hoursLeft?: number }>;
}

/**
 * Thin client for apps/api. Every call first tries the real API and falls
 * back to the bundled dataset (src/data/generated: real restaurants, photos and
 * menus; modelled totals) when the request fails, times out, or returns
 * something that is not JSON.
 *
 * The base URL comes from `EXPO_PUBLIC_API_URL` (inlined at bundle time by
 * Expo). On a phone `localhost` is the phone itself, so point it at the
 * laptop's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`.
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export type Source = 'api' | 'mock';
export interface Sourced<T> {
  data: T;
  source: Source;
}

const TIMEOUT_MS = 2500;

// ---------------------------------------------------------------------------
// Fallback flag. Flipped the first time any call serves sample data; the Home
// screen subscribes and shows a thin "sample prices" bar. Reset when the API
// answers again.
// ---------------------------------------------------------------------------

let usingMock = false;
const listeners = new Set<() => void>();

function setUsingMock(next: boolean) {
  if (usingMock === next) return;
  usingMock = next;
  listeners.forEach((fn) => fn());
}

/** For `useSyncExternalStore`: true once sample data has been served. */
export const mockFallback = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get: () => usingMock,
};

async function tryJson<T>(path: string, validate: (json: unknown) => json is T): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
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

/** React Native's URLSearchParams is partial, so build the query by hand. */
const query = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** No zip gate: every zip, known or not, gets all bundled restaurants (distanceMi is from 15213). */
function filterMock(q: string): Restaurant[] {
  const needle = q.trim().toLowerCase();
  return RESTAURANTS.filter((r) => {
    if (!needle) return true;
    const hay = [r.name, ...r.cuisine, ...r.dietaryTags, ...r.order.map((o) => o.name)]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

export async function getRestaurants(zip: string, q = '', subscriptions: string[] = [], tipPct = 0.15): Promise<Sourced<RestaurantsResponse>> {
  const json = await tryJson(`/api/restaurants?${query({ zip, q: q.trim(), subs: subscriptions.join(','), tip: String(tipPct) })}`, isRestaurantsResponse);
  if (json) {
    const demo = !Array.isArray(json) && json.dataMode === 'demo';
    const data: RestaurantsResponse = Array.isArray(json)
      ? { restaurants: json, refreshedAt: new Date().toISOString() }
      : { ...json, restaurants: json.restaurants.map((r) => demo ? { ...r, imageUrl: undefined } : r) };
    setUsingMock(demo);
    return { data, source: demo ? 'mock' : 'api' };
  }
  setUsingMock(true);
  return { data: { restaurants: filterMock(q), refreshedAt: REFRESHED_AT }, source: 'mock' };
}

export async function getRestaurant(id: string, subscriptions: string[] = [], tipPct = 0.15, zip = ''): Promise<Sourced<Restaurant | undefined>> {
  const json = await tryJson(`/api/restaurants/${encodeURIComponent(id)}?${query({ zip, subs: subscriptions.join(','), tip: String(tipPct) })}`, isRestaurant);
  if (json) {
    const demo = (json as Restaurant & { dataMode?: string }).dataMode === 'demo';
    setUsingMock(demo);
    return { data: demo ? { ...json, imageUrl: undefined } : json, source: demo ? 'mock' : 'api' };
  }
  setUsingMock(true);
  return { data: RESTAURANTS.find((r) => r.id === id), source: 'mock' };
}

export async function getHistory(id: string): Promise<Sourced<PriceSnapshot[]>> {
  const json = await tryJson(`/api/restaurants/${encodeURIComponent(id)}/history`, isSnapshotList);
  if (json) return { data: Array.isArray(json) ? json : json.snapshots, source: 'api' };
  setUsingMock(true);
  return { data: mockHistory(id), source: 'mock' };
}

function isPromosResponse(v: unknown): v is PromosResponse {
  return isObject(v) && Array.isArray(v.promos);
}

const DEMO_PROMOS: PromosResponse['promos'] = [
  { platformSlug: 'doordash', code: 'WEEKNIGHT20', label: '20% off $25+', rule: { type: 'percent', value: 20, minSubtotal: 25 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 5 * 864e5).toISOString(), eligible: true, description: '20% off orders $25+', hoursLeft: 120 },
  { platformSlug: 'doordash', code: 'DASHFREE', label: 'Free delivery $15+', rule: { type: 'freeDelivery', value: 0, minSubtotal: 15 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3 * 864e5).toISOString(), eligible: true, description: 'Free delivery on orders $15+', hoursLeft: 72 },
  { platformSlug: 'ubereats', code: 'EATS5', label: '$5 off $20+', rule: { type: 'flat', value: 5, minSubtotal: 20 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 4 * 864e5).toISOString(), eligible: true, description: '$5 off orders $20+', hoursLeft: 96 },
  { platformSlug: 'ubereats', code: 'UBER25', label: '25% off $30+', rule: { type: 'percent', value: 25, minSubtotal: 30 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 2 * 864e5).toISOString(), eligible: true, description: '25% off orders $30+', hoursLeft: 48 },
  { platformSlug: 'grubhub', code: 'GRUB10', label: '$10 off $35+', rule: { type: 'flat', value: 10, minSubtotal: 35 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 6 * 864e5).toISOString(), eligible: true, description: '$10 off orders $35+', hoursLeft: 144 },
  { platformSlug: 'grubhub', code: 'FREEDELIV', label: 'Free delivery $12+', rule: { type: 'freeDelivery', value: 0, minSubtotal: 12 }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 36e5 * 36).toISOString(), eligible: true, description: 'Free delivery on orders $12+', hoursLeft: 36 },
];

export async function getPromos(platform?: PlatformSlug): Promise<Sourced<PromosResponse>> {
  const path = platform ? `/api/promos?${query({ platform })}` : '/api/promos';
  const json = await tryJson(path, isPromosResponse);
  if (json) return { data: json, source: 'api' };
  return {
    data: {
      now: new Date().toISOString(),
      count: DEMO_PROMOS.length,
      promos: platform ? DEMO_PROMOS.filter((p) => p.platformSlug === platform) : DEMO_PROMOS,
    },
    source: 'mock',
  };
}
