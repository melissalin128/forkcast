import { NOW, PLATFORM_BY_SLUG, PLATFORMS } from '../data/mock';
import type { MenuItem, Offer, PlatformSlug, PriceSnapshot, Restaurant } from '../types';

export const money = (n: number) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(2);

export const platformName = (slug: PlatformSlug) => PLATFORM_BY_SLUG[slug].name;

export function ratingCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

export const offerFor = (r: Restaurant, slug: PlatformSlug) =>
  r.offers.find((o) => o.platformSlug === slug);

export function bestOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => a.total - b.total)[0];
}

export function worstOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => b.total - a.total)[0];
}

export function fastestOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => a.etaMin - b.etaMin)[0];
}

/** Dollars between the cheapest and priciest listing (0 when only one app lists it). */
export function saving(r: Restaurant): number {
  const b = bestOffer(r);
  const w = worstOffer(r);
  if (!b || !w || r.offers.length < 2) return 0;
  return Math.round((w.total - b.total) * 100) / 100;
}

/** "save $5.10 vs DoorDash" / "only app that lists it" / "same price everywhere". */
export function savingsTail(r: Restaurant): string {
  const w = worstOffer(r);
  if (!w || r.offers.length < 2) return 'only app that lists it';
  const s = saving(r);
  if (s < 0.05) return 'same price everywhere';
  return `save ${money(s)} vs ${platformName(w.platformSlug)}`;
}

export const fees = (o: Offer) =>
  Math.round((o.serviceFee + o.deliveryFee + o.smallOrderFee + o.tax + o.tip) * 100) / 100;

export function deepLink(slug: PlatformSlug, r: Restaurant): string {
  return PLATFORM_BY_SLUG[slug].deepLink.replace('{q}', encodeURIComponent(r.name));
}

/**
 * Menu for the Store page. The API may not send one yet, so fall back to the
 * representative order priced by each platform's markup on the subtotal.
 */
export function menuFor(r: Restaurant): MenuItem[] {
  if (r.menu?.length) return r.menu;
  const floor = Math.min(...r.offers.map((o) => o.subtotal));
  const share = 1 / Math.max(1, r.order.reduce((n, l) => n + l.qty, 0));
  return r.order.map((line) => ({
    name: line.name,
    price: Math.round(floor * share * 100) / 100,
    prices: Object.fromEntries(
      r.offers.map((o) => [o.platformSlug, Math.round(o.subtotal * share * 100) / 100]),
    ) as Partial<Record<PlatformSlug, number>>,
  }));
}

export function cheapestMenuPlatform(item: MenuItem): PlatformSlug | undefined {
  return PLATFORMS.map((p) => p.slug)
    .filter((s) => item.prices[s] !== undefined)
    .sort((a, b) => (item.prices[a] ?? 0) - (item.prices[b] ?? 0))[0];
}

// ---------------------------------------------------------------------------
// Best time to order
// ---------------------------------------------------------------------------

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clock = (h: number) => `${h % 12 === 0 ? 12 : h % 12}`;
const ampm = (h: number) => (h < 12 ? 'am' : 'pm');

/** "Wednesday 2–4 pm" */
export function windowLabel(dow: number, hour: number) {
  const end = hour + 2;
  const same = ampm(hour) === ampm(end);
  return `${DAY_LONG[dow]} ${clock(hour)}${same ? '' : ' ' + ampm(hour)}–${clock(end)} ${ampm(end)}`;
}

/** "Wednesday afternoon" */
export function windowPlain(dow: number, hour: number) {
  const part = hour < 11 ? 'morning' : hour < 14 ? 'lunchtime' : hour < 17 ? 'afternoon' : 'evening';
  return `${DAY_LONG[dow]} ${part}`;
}

export interface Window {
  dow: number;
  hour: number;
  avg: number;
  /** When this window last occurred in the series (for the chart band). */
  fromAt: string;
  toAt: string;
}

export interface BestTime {
  platformSlug: PlatformSlug;
  best: Window;
  worst: Window;
  now: number;
  saving: number;
  savingPct: number;
}

/**
 * Two-hour windows within plausible ordering hours (noon–10pm), averaged over
 * the 7-day series of the platform that is cheapest right now. Hours with a
 * time-boxed promo applied are skipped: they say nothing about what the
 * platform *usually* charges.
 */
export function bestTime(snapshots: PriceSnapshot[], slug: PlatformSlug): BestTime | null {
  const rows = snapshots
    .filter((s) => s.platformSlug === slug)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (rows.length < 24) return null;

  type Bucket = { dow: number; hour: number; sum: number; n: number; at: string[] };
  const buckets = new Map<string, Bucket>();
  rows.forEach((s) => {
    if (s.promoApplied) return;
    const d = new Date(s.capturedAt);
    const h = d.getHours();
    if (h < 12 || h >= 22) return;
    const start = h - (h % 2);
    const key = `${d.getDay()}-${start}`;
    const b = buckets.get(key) ?? { dow: d.getDay(), hour: start, sum: 0, n: 0, at: [] };
    b.sum += s.total;
    b.n += 1;
    b.at.push(s.capturedAt);
    buckets.set(key, b);
  });

  const windows: Window[] = [...buckets.values()].map((b) => ({
    dow: b.dow,
    hour: b.hour,
    avg: b.sum / b.n,
    fromAt: b.at[0],
    toAt: b.at[b.at.length - 1],
  }));
  if (!windows.length) return null;
  const sorted = [...windows].sort((a, b) => a.avg - b.avg);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const now = rows[rows.length - 1].total;
  const gain = Math.max(0, now - best.avg);
  return {
    platformSlug: slug,
    best,
    worst,
    now,
    saving: gain,
    savingPct: now > 0 ? Math.round((gain / now) * 100) : 0,
  };
}

export function minutesAgo(iso: string, now = NOW) {
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  return m <= 1 ? 'just now' : `${m} min ago`;
}

export function endsIn(iso: string, now = NOW) {
  const mins = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'ended';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `ends in ${Math.round(h / 24)} d`;
  return h > 0 ? `ends in ${h} h ${m} m` : `ends in ${m} m`;
}
