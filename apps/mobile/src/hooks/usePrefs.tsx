import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '../lib/prefs';
import type { PlatformSlug } from '../types';

interface PrefsApi {
  prefs: Prefs;
  /** False until AsyncStorage has answered; data hooks wait for it. */
  ready: boolean;
  setZip: (zip: string) => void;
  toggleSubscription: (slug: PlatformSlug) => void;
}

const Ctx = createContext<PrefsApi | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPrefs().then((p) => {
      if (!alive) return;
      setPrefs(p);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((next: Prefs) => {
    setPrefs(next);
    void savePrefs(next);
  }, []);

  const api = useMemo<PrefsApi>(
    () => ({
      prefs,
      ready,
      setZip: (zip) => update({ ...prefs, zip }),
      toggleSubscription: (slug) =>
        update({
          ...prefs,
          subscriptions: prefs.subscriptions.includes(slug)
            ? prefs.subscriptions.filter((s) => s !== slug)
            : [...prefs.subscriptions, slug],
        }),
    }),
    [prefs, ready, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return v;
}
