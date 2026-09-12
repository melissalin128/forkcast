import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadPrefs, savePrefs, type DietaryPref, type Prefs } from '../lib/prefs';
import type { PlatformSlug } from '../types';

interface PrefsApi {
  prefs: Prefs;
  setZip: (zip: string) => void;
  setTipPct: (tipPct: number) => void;
  toggleSubscription: (slug: PlatformSlug) => void;
  toggleDietary: (tag: DietaryPref) => void;
  toggleCuisine: (cuisine: string) => void;
  toggleSaved: (id: string) => void;
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
      setTipPct: (tipPct) => update({ ...prefs, tipPct }),
      toggleSubscription: (slug) =>
        update({
          ...prefs,
          subscriptions: prefs.subscriptions.includes(slug)
            ? prefs.subscriptions.filter((s) => s !== slug)
            : [...prefs.subscriptions, slug],
        }),
      toggleDietary: (tag) =>
        update({
          ...prefs,
          dietaryDefaults: prefs.dietaryDefaults.includes(tag)
            ? prefs.dietaryDefaults.filter((d) => d !== tag)
            : [...prefs.dietaryDefaults, tag],
        }),
      toggleCuisine: (cuisine) =>
        update({
          ...prefs,
          favoriteCuisines: prefs.favoriteCuisines.includes(cuisine)
            ? prefs.favoriteCuisines.filter((c) => c !== cuisine)
            : [...prefs.favoriteCuisines, cuisine],
        }),
      toggleSaved: (id) =>
        update({
          ...prefs,
          savedRestaurantIds: prefs.savedRestaurantIds.includes(id)
            ? prefs.savedRestaurantIds.filter((x) => x !== id)
            : [...prefs.savedRestaurantIds, id],
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
