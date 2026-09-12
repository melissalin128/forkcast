import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadPrefs, savePrefs, type Prefs } from '../lib/prefs';
import type { PlatformSlug } from '../types';

interface PrefsApi {
  prefs: Prefs;
  setZip: (zip: string) => void;
  toggleSubscription: (slug: PlatformSlug) => void;
}

const Ctx = createContext<PrefsApi | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  const update = useCallback((next: Prefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const api = useMemo<PrefsApi>(
    () => ({
      prefs,
      setZip: (zip) => update({ ...prefs, zip }),
      toggleSubscription: (slug) =>
        update({
          ...prefs,
          subscriptions: prefs.subscriptions.includes(slug)
            ? prefs.subscriptions.filter((s) => s !== slug)
            : [...prefs.subscriptions, slug],
        }),
    }),
    [prefs, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return v;
}
