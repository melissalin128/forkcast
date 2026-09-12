import type { PriceSnapshot } from '../models/types';
import { round2 } from './computeTotal';

export interface BestWindow {
  /** 0 = Sunday ... 6 = Saturday (local server time) */
  dayOfWeek: number;
  /** Inclusive start hour (0-23) */
  startHour: number;
  /** Exclusive end hour (1-24) */
  endHour: number;
  /** Average cheapest-platform total inside the window */
  avgTotal: number;
  /** How much cheaper the window is than the current best total, in percent (0-100). */
  pctBelowNow: number;
  /** Number of hourly samples the window average is based on */
  samples: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (d: number): string => DAY_NAMES[((d % 7) + 7) % 7];

/**
 * "Tuesday 2-4 pm is on average 18% cheaper than now."
 *
 * For every capture timestamp we take the cheapest platform total, bucket by
 * (dayOfWeek, hour), average, find the cheapest bucket, and grow it into a
 * contiguous window of hours whose average is within `tolerance` (1%) of that minimum.
 */
export function computeBestWindow(
  snapshots: PriceSnapshot[],
  nowTotal: number | null,
  tolerance = 0.01,
): BestWindow | null {
  if (snapshots.length === 0) return null;

  // cheapest platform per capture instant
  const cheapestAt = new Map<number, number>();
  for (const s of snapshots) {
    const t = new Date(s.capturedAt).getTime();
    const prev = cheapestAt.get(t);
    if (prev === undefined || s.total < prev) cheapestAt.set(t, s.total);
  }

  // bucket by day-of-week and hour
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const [t, total] of cheapestAt) {
    const d = new Date(t);
    const key = `${d.getDay()}:${d.getHours()}`;
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += total;
    b.n += 1;
    buckets.set(key, b);
  }
  if (buckets.size === 0) return null;

  let bestKey = '';
  let bestAvg = Infinity;
  for (const [key, b] of buckets) {
    const avg = b.sum / b.n;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestKey = key;
    }
  }
  const [dow, hour] = bestKey.split(':').map(Number);
  const avgOf = (h: number) => {
    const b = buckets.get(`${dow}:${h}`);
    return b ? b.sum / b.n : Infinity;
  };
  const limit = bestAvg * (1 + tolerance);

  let start = hour;
  while (start - 1 >= 0 && avgOf(start - 1) <= limit) start -= 1;
  let end = hour + 1;
  while (end < 24 && avgOf(end) <= limit) end += 1;

  let sum = 0;
  let n = 0;
  for (let h = start; h < end; h += 1) {
    const b = buckets.get(`${dow}:${h}`);
    if (b) {
      sum += b.sum;
      n += b.n;
    }
  }
  const avgTotal = round2(sum / n);
  const pctBelowNow =
    nowTotal && nowTotal > 0 ? round2(Math.max(0, ((nowTotal - avgTotal) / nowTotal) * 100)) : 0;

  return { dayOfWeek: dow, startHour: start, endHour: end, avgTotal, pctBelowNow, samples: n };
}
