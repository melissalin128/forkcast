import { ZIP_CENTROIDS } from '../seed/data';
import type { GeoPoint } from '../models/types';

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Distance from the requesting zip's centroid, or null when the zip is unknown. */
export function distanceFromZip(zip: string | undefined, geo: GeoPoint): number | null {
  if (!zip) return null;
  const c = ZIP_CENTROIDS[zip];
  if (!c) return null;
  return Math.round(haversineMiles({ lat: c.lat, lng: c.lng }, geo) * 10) / 10;
}
