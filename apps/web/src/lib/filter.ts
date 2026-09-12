import { bestOffer, fastestOffer } from './analysis';
import type { Restaurant } from '../types';

export const CATEGORIES = ['All', 'Pizza', 'Burgers', 'Ramen', 'Indian', 'Mexican', 'Thai', 'Grocery'] as const;
export type Category = (typeof CATEGORIES)[number];

export const matchesCategory = (r: Restaurant, cat: string) =>
  cat === 'All' || r.category === cat || r.cuisine.includes(cat);

export const matchesQuery = (r: Restaurant, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [
    r.name,
    r.category ?? '',
    ...r.cuisine,
    ...r.dietaryTags,
    ...r.order.map((o) => o.name),
    ...(r.menu ?? []).map((m) => m.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
};

export type FilterKey = 'under20' | 'under30min' | 'vegan' | 'halal' | 'glutenfree';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'under20', label: 'Under $20' },
  { key: 'under30min', label: 'Under 30 min' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'halal', label: 'Halal' },
  { key: 'glutenfree', label: 'Gluten-free' },
];

const FILTER_FN: Record<FilterKey, (r: Restaurant) => boolean> = {
  under20: (r) => (bestOffer(r)?.total ?? Infinity) < 20,
  under30min: (r) => (fastestOffer(r)?.etaMin ?? Infinity) < 30,
  vegan: (r) => r.dietaryTags.includes('Vegan options'),
  halal: (r) => r.dietaryTags.includes('Halal') || r.cuisine.includes('Halal'),
  glutenfree: (r) => r.dietaryTags.includes('Gluten-free options'),
};

export const matchesFilters = (r: Restaurant, active: FilterKey[]) =>
  active.every((k) => FILTER_FN[k](r));

export type Sort = 'cheapest' | 'fastest' | 'rated';

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'rated', label: 'Top rated' },
];

const SORT_FN: Record<Sort, (a: Restaurant, b: Restaurant) => number> = {
  cheapest: (a, b) => (bestOffer(a)?.total ?? 0) - (bestOffer(b)?.total ?? 0),
  fastest: (a, b) => (fastestOffer(a)?.etaMin ?? 0) - (fastestOffer(b)?.etaMin ?? 0),
  rated: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
};

export const sortBy = (list: Restaurant[], sort: Sort) => [...list].sort(SORT_FN[sort]);
