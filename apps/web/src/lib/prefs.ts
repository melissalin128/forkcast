import { ZIP } from '../data/mock';
import type { Offer, PlatformSlug, PriceSnapshot, Restaurant } from '../types';

/**
 * Per-device preferences (spec D3: subscriptions are an input; D6: zip is the
 * only required input). Stored in localStorage; the API has no user endpoint
 * yet, so totals are re-derived client-side in `applyPrefs`.
 */
export interface Prefs {
  zip: string;
  subscriptions: PlatformSlug[];
  /** Tip as a decimal fraction, e.g. 0.15. */
  tipPct: number;
}

/** No passes until the user turns one on in Account. */
export const DEFAULT_PREFS: Prefs = { zip: ZIP, subscriptions: [], tipPct: 0.15 };

const KEY = 'forkcast.prefs';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const j: unknown = JSON.parse(raw);
    if (typeof j !== 'object' || j === null) return DEFAULT_PREFS;
    const o = j as Partial<Prefs>;
    const subs = Array.isArray(o.subscriptions)
      ? o.subscriptions.filter((s): s is PlatformSlug => s === 'doordash' || s === 'ubereats' || s === 'grubhub')
      : DEFAULT_PREFS.subscriptions;
    const zip = typeof o.zip === 'string' && /^\d{5}$/.test(o.zip) ? o.zip : DEFAULT_PREFS.zip;
    const tipPct = typeof o.tipPct === 'number' && o.tipPct >= 0 && o.tipPct <= 0.3 ? o.tipPct : DEFAULT_PREFS.tipPct;
    return { zip, subscriptions: subs, tipPct };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: prefs live for the session only */
  }
}

/** What a platform charges to deliver when you do not hold its pass. */
const DELIVERY_FEE_WITHOUT_PASS = 2.99;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-derive one offer for the passes this user actually holds. Server totals
 * were computed for a fixed set of passes; if the user's set differs we add
 * or waive the delivery fee. Everything else (markup, service fee, promo) is
 * left untouched.
 */
export function applyPrefsToOffer(o: Offer, subs: PlatformSlug[], tipPct = 0.15): Offer {
  const holds = subs.includes(o.platformSlug);
  const deliveryFee = holds ? 0 : o.subscriptionApplied ? DELIVERY_FEE_WITHOUT_PASS : o.deliveryFee;
  const tip = round2(o.subtotal * tipPct);
  const total = round2(o.total + (deliveryFee - o.deliveryFee) + (tip - o.tip));
  if (deliveryFee === o.deliveryFee && tip === o.tip && holds === o.subscriptionApplied) return o;
  return { ...o, deliveryFee, tip, total, subscriptionApplied: holds };
}

export function applyPrefs(r: Restaurant, subs: PlatformSlug[], tipPct = 0.15): Restaurant {
  const offers = r.offers.map((o) => applyPrefsToOffer(o, subs, tipPct));
  const displayTip = Math.round(tipPct * 100);
  return offers.every((o, i) => o === r.offers[i]) && r.tipPct === displayTip ? r : { ...r, offers, tipPct: displayTip };
}

/** Shift each platform's history by the same delta its live offer moved. */
export function applyPrefsToSnapshots(
  rows: PriceSnapshot[],
  original: Restaurant,
  adjusted: Restaurant,
): PriceSnapshot[] {
  if (original === adjusted) return rows;
  const delta = new Map<PlatformSlug, number>();
  original.offers.forEach((o, i) => delta.set(o.platformSlug, round2(adjusted.offers[i].total - o.total)));
  return rows.map((s) => {
    const d = delta.get(s.platformSlug) ?? 0;
    return d ? { ...s, total: round2(s.total + d) } : s;
  });
}

const ZIP_NAMES: Record<string, string> = {
  '15213': 'Oakland',
  '15232': 'Shadyside',
  '15217': 'Squirrel Hill',
  '15206': 'East Liberty',
  '15203': 'South Side',
  '15222': 'Downtown',
  '15224': 'Bloomfield',
  '15201': 'Lawrenceville',
};

export const zipLabel = (zip: string) => ZIP_NAMES[zip] ?? 'Pittsburgh';
