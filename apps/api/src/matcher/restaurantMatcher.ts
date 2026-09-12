/**
 * RestaurantMatcher: joins the same physical restaurant across platforms by
 * normalized name + street number (spec section 6). Platforms spell names
 * differently ("Pamela's P&G Diner" vs "Pamelas P & G Diner - Oakland"), so
 * we compare a token set after stripping punctuation and filler words, and
 * require the street number to agree.
 */
import type { PlatformSlug } from '../models/types';
import type { PlatformListing } from '../adapters/types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'at', 'in', 'on',
  'restaurant', 'restaurants', 'eatery', 'kitchen', 'llc', 'inc',
  // location suffixes platforms append
  'pittsburgh', 'oakland', 'shadyside', 'squirrel', 'hill', 'pa',
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation ("Pamela's" -> "pamela s")
    .replace(/\b(\w+)\s+s\b/g, '$1s') // rejoin possessives: "pamela s" -> "pamelas"
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
    .join(' ')
    .trim();
}

/** Leading house number of a street address ("3703 Forbes Ave" -> "3703"). */
export function streetNumber(address: string): string {
  const m = address.trim().match(/^(\d+[a-z]?)\b/i);
  return m ? m[1].toLowerCase() : '';
}

export function matchKey(name: string, address: string): string {
  return `${normalizeName(name)}|${streetNumber(address)}`;
}

/** Jaccard similarity of the token sets of two normalized names. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export interface MatchedRestaurant {
  key: string;
  name: string;
  address: string;
  platformIds: Partial<Record<PlatformSlug, string>>;
  listings: PlatformListing[];
}

export interface MatchOptions {
  /** Token-set similarity needed to merge two names with the same street number. */
  threshold?: number;
}

/**
 * Groups listings from several platforms into physical restaurants.
 * Exact key matches merge first; then listings with the same street number
 * and a name similarity >= threshold merge. A platform never appears twice
 * in one group.
 */
export function matchRestaurants(listings: PlatformListing[], options: MatchOptions = {}): MatchedRestaurant[] {
  const threshold = options.threshold ?? 0.6;
  const groups: MatchedRestaurant[] = [];

  for (const l of listings) {
    const key = matchKey(l.name, l.address);
    const num = streetNumber(l.address);

    let target =
      groups.find((g) => g.key === key && !g.platformIds[l.platformSlug]) ??
      groups.find(
        (g) =>
          !g.platformIds[l.platformSlug] &&
          num !== '' &&
          streetNumber(g.address) === num &&
          nameSimilarity(g.name, l.name) >= threshold,
      );

    if (!target) {
      target = { key, name: l.name, address: l.address, platformIds: {}, listings: [] };
      groups.push(target);
    }
    target.platformIds[l.platformSlug] = l.platformRestaurantId;
    target.listings.push(l);
  }

  return groups;
}
