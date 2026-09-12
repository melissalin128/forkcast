/**
 * OpenStreetMap enrichment (part of `npm run ingest`, after the WPRDC pass).
 *
 * WPRDC gives us real names, addresses and coordinates but no cuisine, hours or
 * contact details. OSM has those, so this pulls every food POI in the Pittsburgh
 * bounding box via the public Overpass API (ODbL, attribution in docs) and
 * conservatively matches each one to a Restaurant row promoted from WPRDC.
 *
 * A wrong match is worse than no match, so matching is name + distance only:
 * exact normalised name within 250 m, or a strongly similar name within 150 m,
 * nearest candidate wins, and every POI and restaurant is used at most once.
 */
import type { Model } from 'mongoose';
import { DIETARY_TAGS, RestaurantModel, type DietaryTag } from '../models';
import { PGH_BBOX, bulkUpsert, done, overpass } from './common';

/** Words that carry no identity and just cause false negatives. */
const DROP = new Set(['the', 'restaurant', 'pittsburgh', 'llc', 'inc', 'co']);

/** lowercase, de-accent, strip punctuation, drop filler words. */
export function normName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !DROP.has(w))
    .join(' ');
}

/** Great-circle distance in metres. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Dice coefficient over character bigrams: 1 = identical, 0 = nothing in common. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const g = b.slice(i, i + 2);
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      counts.set(g, left - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1));
}

/**
 * "Same business, written differently": one name contains the other
 * ("Starbucks" / "Starbucks Coffee") or the bigrams overlap heavily
 * ("Primanti Bros" / "Primanti Brothers"). Spaces are ignored on both.
 */
export function strongMatch(a: string, b: string): boolean {
  const x = a.replace(/ /g, '');
  const y = b.replace(/ /g, '');
  if (x.length < 6 || y.length < 6) return false; // short names collide too easily
  if (x.includes(y) || y.includes(x)) return true;
  // 0.75 is the lowest threshold that still clears near-misses like
  // "china express" / "china garden" (0.36) while catching "bros" / "brothers".
  return nameSimilarity(x, y) >= 0.75;
}

const DIET_TAGS: Array<[string, DietaryTag]> = [
  ['diet:vegan', 'vegan'],
  ['diet:vegetarian', 'vegetarian'],
  ['diet:gluten_free', 'gluten-free'],
  ['diet:halal', 'halal'],
  ['diet:kosher', 'kosher'],
];

interface Poi {
  osmId: string;
  name: string;
  norm: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

interface Cand {
  poi: number;
  rest: number;
  dist: number;
  /** 1 = exact normalised name, 2 = strong similarity. Tier 1 wins ties. */
  tier: 1 | 2;
}

export async function ingestOsm(): Promise<{ pois: number; matched: number }> {
  const [south, west, north, east] = PGH_BBOX;
  const query = `[out:json][timeout:180];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten)$"](${south},${west},${north},${east});
);
out center tags;`;

  const elements = await overpass(query);
  const pois: Poi[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue; // unnamed POIs can never match
    const norm = normName(name);
    if (norm.length === 0) continue;
    pois.push({ osmId: `${el.type}/${el.id}`, name, norm, lat, lng, tags });
  }
  done('osm', `${elements.length.toLocaleString()} elements, ${pois.length.toLocaleString()} named food POIs`);

  const rows = await RestaurantModel.find({ source: 'wprdc' }, { name: 1, location: 1 }).lean();
  const rests = rows
    .map((r) => ({
      id: r._id,
      norm: normName(r.name),
      lat: r.location?.geo?.lat,
      lng: r.location?.geo?.lng,
    }))
    .filter((r): r is { id: typeof r.id; norm: string; lat: number; lng: number } =>
      r.norm.length > 0 && typeof r.lat === 'number' && typeof r.lng === 'number',
    );

  // Collect every plausible pair. 0.0025 deg of latitude is ~278 m, so the cheap
  // latitude gate drops almost everything before we pay for a haversine.
  const cands: Cand[] = [];
  for (let p = 0; p < pois.length; p += 1) {
    const poi = pois[p]!;
    for (let r = 0; r < rests.length; r += 1) {
      const rest = rests[r]!;
      if (Math.abs(rest.lat - poi.lat) > 0.0025) continue;
      const exact = rest.norm === poi.norm;
      if (!exact && !strongMatch(rest.norm, poi.norm)) continue;
      const dist = haversineM(poi.lat, poi.lng, rest.lat, rest.lng);
      if (dist > (exact ? 250 : 150)) continue;
      cands.push({ poi: p, rest: r, dist, tier: exact ? 1 : 2 });
    }
  }

  // Nearest-first greedy assignment keeps it one POI <-> one restaurant.
  cands.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
  const usedPoi = new Set<number>();
  const usedRest = new Set<number>();
  const ops: Array<Record<string, unknown>> = [];
  for (const c of cands) {
    if (usedPoi.has(c.poi) || usedRest.has(c.rest)) continue;
    usedPoi.add(c.poi);
    usedRest.add(c.rest);

    const { tags, osmId } = pois[c.poi]!;
    const set: Record<string, unknown> = { osmId };
    const cuisine = (tags.cuisine ?? '')
      .split(';')
      .map((t) => t.trim().toLowerCase().replace(/_/g, ' '))
      .filter((t) => t.length > 0);
    if (cuisine.length > 0) set.cuisine = cuisine;
    const diet = DIET_TAGS.filter(([k]) => tags[k] === 'yes' || tags[k] === 'only')
      .map(([, tag]) => tag)
      .filter((tag) => DIETARY_TAGS.includes(tag));
    if (diet.length > 0) set.dietaryTags = diet;
    const phone = tags.phone ?? tags['contact:phone'];
    if (phone) set.phone = phone;
    const website = tags.website ?? tags['contact:website'];
    if (website) set.website = website;
    if (tags.opening_hours) set.openingHours = tags.opening_hours;

    // Observed OSM cuisine replaces the name-regex guess wprdcFacilities.ts made,
    // so it must stop being listed as derived.
    const update: Record<string, unknown> = { $set: set };
    if (cuisine.length > 0) update.$pull = { derivedFields: 'cuisine' };
    ops.push({ updateOne: { filter: { _id: rests[c.rest]!.id }, update } });
  }

  const written = await bulkUpsert(RestaurantModel as unknown as Model<Record<string, unknown>>, ops, 'osm');
  done(
    'osm',
    `matched ${ops.length.toLocaleString()} of ${pois.length.toLocaleString()} POIs ` +
      `(${(pois.length - ops.length).toLocaleString()} POIs matched nothing, ` +
      `${(rests.length - ops.length).toLocaleString()} WPRDC restaurants still have no OSM data); ` +
      `${written.toLocaleString()} rows updated`,
  );
  return { pois: pois.length, matched: ops.length };
}
