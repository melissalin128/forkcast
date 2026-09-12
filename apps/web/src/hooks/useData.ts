import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getDeals, getHistory, getPromos, getRestaurant, getRestaurants, mockFallback, type Deal, type PromosResponse, type Source } from '../api/client';
import { REFRESHED_AT } from '../data/mock';
import { applyPrefs, applyPrefsToSnapshots } from '../lib/prefs';
import type { PriceSnapshot, Restaurant } from '../types';
import { usePrefs } from './usePrefs';

/** True once the client has served sample data instead of the API. */
export function useMockFallback(): boolean {
  return useSyncExternalStore(mockFallback.subscribe, mockFallback.get, () => false);
}

/** Every restaurant near the user's zip, with their passes applied to every total. */
export function useRestaurants() {
  const { prefs } = usePrefs();
  const [raw, setRaw] = useState<Restaurant[]>([]);
  const [refreshedAt, setRefreshedAt] = useState(REFRESHED_AT);
  const [source, setSource] = useState<Source>('mock');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRestaurants(prefs.zip, '', prefs.subscriptions, prefs.tipPct).then(({ data, source }) => {
      if (!alive) return;
      setRaw(data.restaurants);
      setRefreshedAt(data.refreshedAt);
      setSource(source);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [prefs.zip, prefs.subscriptions, prefs.tipPct, refreshKey]);

  const restaurants = useMemo(
    () => raw.map((r) => applyPrefs(r, prefs.subscriptions, prefs.tipPct)),
    [raw, prefs.subscriptions, prefs.tipPct],
  );

  return { restaurants, refreshedAt, source, loading, refresh: () => setRefreshKey((n) => n + 1) };
}

/** One restaurant plus its 7-day history. `restaurant` is undefined while loading, null when missing. */
export function useStore(id: string) {
  const { prefs } = usePrefs();
  const [raw, setRaw] = useState<Restaurant | null | undefined>(undefined);
  const [rawHistory, setRawHistory] = useState<PriceSnapshot[]>([]);
  const [source, setSource] = useState<Source>('mock');

  useEffect(() => {
    let alive = true;
    setRaw(undefined);
    setRawHistory([]);
    Promise.all([getRestaurant(id, prefs.subscriptions, prefs.tipPct, prefs.zip), getHistory(id)]).then(([r, h]) => {
      if (!alive) return;
      setRaw(r.data ?? null);
      setRawHistory(h.data);
      setSource(r.source);
    });
    return () => {
      alive = false;
    };
  }, [id, prefs.subscriptions, prefs.tipPct]);

  const restaurant = useMemo(
    () => (raw ? applyPrefs(raw, prefs.subscriptions, prefs.tipPct) : raw),
    [raw, prefs.subscriptions, prefs.tipPct],
  );
  const snapshots = useMemo(
    () => (raw && restaurant ? applyPrefsToSnapshots(rawHistory, raw, restaurant) : rawHistory),
    [rawHistory, raw, restaurant],
  );

  return { restaurant, snapshots, source };
}

export function usePromos() {
  const [promos, setPromos] = useState<PromosResponse['promos']>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getPromos().then(({ data }) => {
      if (!alive) return;
      setPromos(data.promos);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { promos, loading };
}

/**
 * Live scraped deals for the configured address. Empty when the API is down or
 * no run has landed yet; the UI hides the strip rather than inventing any.
 */
export function useDeals(limit = 20) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getDeals({ limit }).then((res) => {
      if (!alive) return;
      setDeals(res?.deals ?? []);
      setRefreshedAt(res?.refreshedAt ?? null);
      setTotalActive(res?.totalActive ?? 0);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [limit]);

  return { deals, refreshedAt, totalActive, loading };
}
