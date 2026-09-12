import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getHistory, getRestaurant, getRestaurants, mockFallback, type Source } from '../api/client';
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
  const { prefs, ready } = usePrefs();
  const [raw, setRaw] = useState<Restaurant[]>([]);
  const [refreshedAt, setRefreshedAt] = useState(REFRESHED_AT);
  const [source, setSource] = useState<Source>('mock');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    getRestaurants(prefs.zip).then(({ data, source }) => {
      if (!alive) return;
      setRaw(data.restaurants);
      setRefreshedAt(data.refreshedAt);
      setSource(source);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [prefs.zip, ready]);

  const restaurants = useMemo(
    () => raw.map((r) => applyPrefs(r, prefs.subscriptions)),
    [raw, prefs.subscriptions],
  );

  return { restaurants, refreshedAt, source, loading };
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
    Promise.all([getRestaurant(id), getHistory(id)]).then(([r, h]) => {
      if (!alive) return;
      setRaw(r.data ?? null);
      setRawHistory(h.data);
      setSource(r.source);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const restaurant = useMemo(
    () => (raw ? applyPrefs(raw, prefs.subscriptions) : raw),
    [raw, prefs.subscriptions],
  );
  const snapshots = useMemo(
    () => (raw && restaurant ? applyPrefsToSnapshots(rawHistory, raw, restaurant) : rawHistory),
    [rawHistory, raw, restaurant],
  );

  return { restaurant, snapshots, source };
}
