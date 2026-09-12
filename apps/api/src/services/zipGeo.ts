/**
 * Zip -> coordinates for the live scrapers. Uber Eats wants a lat/lng in its
 * location cookie and Grubhub's search API takes a `POINT(lng lat)`, so every
 * adapter needs this before it can show prices for a zip.
 *
 * Order: seed centroids (offline, instant) -> api.zippopotam.us (free, no key)
 * -> null. Results are memoised for the process lifetime.
 */
import { ZIP_CENTROIDS } from '../seed/data';

export interface ZipLocation {
  zip: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  /** "Pittsburgh, PA 15213" — what to type into a platform's address box. */
  label: string;
}

const cache = new Map<string, Promise<ZipLocation | null>>();

const STATE_BY_ZIP_PREFIX: Record<string, string> = { '150': 'PA', '151': 'PA', '152': 'PA', '153': 'PA' };

export function geocodeZip(zip: string, fetchImpl: typeof fetch = fetch): Promise<ZipLocation | null> {
  let p = cache.get(zip);
  if (!p) {
    p = lookup(zip, fetchImpl);
    cache.set(zip, p);
    p.then((v) => v === null && cache.delete(zip)).catch(() => cache.delete(zip));
  }
  return p;
}

async function lookup(zip: string, fetchImpl: typeof fetch): Promise<ZipLocation | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const seeded = ZIP_CENTROIDS[zip];
  if (seeded) {
    const state = STATE_BY_ZIP_PREFIX[zip.slice(0, 3)] ?? 'PA';
    return { zip, lat: seeded.lat, lng: seeded.lng, city: 'Pittsburgh', state, label: `Pittsburgh, ${state} ${zip}` };
  }
  try {
    const res = await fetchImpl(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return parseZippopotam(zip, await res.text());
  } catch {
    return null;
  }
}

/** Pure parser for the zippopotam.us payload (tested with a fixture). */
export function parseZippopotam(zip: string, json: string): ZipLocation | null {
  try {
    const data = JSON.parse(json) as { places?: Array<Record<string, string>> };
    const place = data.places?.[0];
    if (!place) return null;
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const city = place['place name'] ?? '';
    const state = place['state abbreviation'] ?? '';
    return { zip, lat, lng, city, state, label: `${city}, ${state} ${zip}`.replace(/^, /, '').trim() };
  } catch {
    return null;
  }
}
