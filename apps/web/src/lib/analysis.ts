import { NOW, PLATFORM_BY_SLUG } from '../data/mock';
import type { Offer, PlatformSlug, PriceSnapshot, Restaurant } from '../types';

export const money = (n: number) =>
  (n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(2);

export const eta = (o: Offer) => `${o.etaMin} min`;

export const platformName = (slug: PlatformSlug) => PLATFORM_BY_SLUG[slug].name;

export function ratingCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

export function bestOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => a.total - b.total)[0];
}

export function worstOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => b.total - a.total)[0];
}

export function fastestOffer(r: Restaurant): Offer | undefined {
  return [...r.offers].sort((a, b) => a.etaMin - b.etaMin)[0];
}

/** "$5.10 less than Uber Eats" / "Only on Grubhub" / "Same price everywhere". */
export function comparisonSentence(r: Restaurant, suffix = ''): string {
  const best = bestOffer(r);
  const worst = worstOffer(r);
  if (!best || !worst) return 'Not listed nearby';
  if (r.offers.length === 1) return `Only on ${platformName(best.platformSlug)}`;
  const diff = worst.total - best.total;
  if (diff < 0.05) return 'Same price everywhere';
  return `${money(diff)} less than ${platformName(worst.platformSlug)}${suffix}`;
}

export type Tone = 'win' | 'accent' | 'warn' | 'muted';

/**
 * The one sentence under the cheapest platform on a card. Promo wins, then a
 * dinner-peak warning, then the plain comparison.
 */
export function cardSentence(r: Restaurant): { text: string; tone: Tone } {
  const best = bestOffer(r);
  if (!best) return { text: 'Not listed nearby', tone: 'muted' };
  const promo = promoShort(best);
  const compare = comparisonSentence(r);
  if (promo) {
    const tail = r.offers.length > 1 && !compare.startsWith('Same') ? `, ${compare}` : '';
    return { text: `${promo}${tail}`, tone: 'accent' };
  }
  if ((r.peakSurcharge ?? 0) >= 3) {
    const h = NOW.getHours();
    const when = h >= 17 && h < 21 ? 'at dinner' : 'right now';
    return { text: `Everyone is $${Math.round(r.peakSurcharge ?? 0)} pricier ${when}`, tone: 'warn' };
  }
  return { text: compare, tone: r.offers.length === 1 ? 'muted' : 'win' };
}

/** "20% off today ($4.60)" — a percentage never appears without its dollars. */
export function promoShort(o: Offer | undefined): string | null {
  if (!o?.promo || o.promoDiscount <= 0) return null;
  const { rule } = o.promo;
  if (rule.type === 'percent') return `${rule.value}% off today (${money(o.promoDiscount)})`;
  if (rule.type === 'flat') return `$${rule.value} off today`;
  return `Free delivery today (${money(o.promoDiscount)})`;
}

/** Promo copy with the dollar amount always next to the percentage. */
export function promoSentence(o: Offer | undefined): string | null {
  if (!o?.promo || o.promoDiscount <= 0) return null;
  const on = ` on ${platformName(o.platformSlug)}`;
  const { rule } = o.promo;
  if (rule.type === 'percent') return `${rule.value}% off (${money(o.promoDiscount)})${on}`;
  if (rule.type === 'flat') return `$${rule.value} off${on}`;
  return `Free delivery (${money(o.promoDiscount)})${on}`;
}

export const fees = (o: Offer) =>
  Math.round((o.serviceFee + o.deliveryFee + o.smallOrderFee + o.tax + o.tip) * 100) / 100;

export function deepLink(slug: PlatformSlug, r: Restaurant): string {
  return PLATFORM_BY_SLUG[slug].deepLink.replace('{q}', encodeURIComponent(r.name));
}

// ---------------------------------------------------------------------------
// Best time to order
// ---------------------------------------------------------------------------

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clock = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}`;
};
const ampm = (h: number) => (h < 12 ? 'am' : 'pm');

/** "Wed 2–4 pm" */
export function windowLabel(dow: number, hour: number) {
  const end = hour + 2;
  const sameMeridiem = ampm(hour) === ampm(end);
  return `${DAY_SHORT[dow]} ${clock(hour)}${sameMeridiem ? '' : ' ' + ampm(hour)}–${clock(end)} ${ampm(end)}`;
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
  const saving = Math.max(0, now - best.avg);
  return {
    platformSlug: slug,
    best,
    worst,
    now,
    saving,
    savingPct: now > 0 ? Math.round((saving / now) * 100) : 0,
  };
}

export function peakLabel(date = NOW) {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const isPeak = h >= 17 && h < 21;
  return `${DAY_LONG[date.getDay()]} ${clock(h)}:${m} ${ampm(h)} is ${isPeak ? 'a peak hour' : 'off-peak'}`;
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
