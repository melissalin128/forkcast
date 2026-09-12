import { bestOffer, cheapestFeeOffer, fastestOffer } from './analysis';
import type { Prefs } from './prefs';
import type { Restaurant } from '../types';

export const CATEGORIES = [
  'All',
  'Pizza',
  'Burgers',
  'Chinese',
  'Mexican',
  'Sushi',
  'Indian',
  'Thai',
  'Italian',
  'Chicken',
  'Sandwiches',
  'Breakfast',
  'Healthy',
  'Desserts',
  'Coffee',
  'Vegan',
  'Halal',
  'Grocery',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** `?category=sushi` -> 'Sushi'; anything unknown is 'All'. */
export const categoryFromSlug = (slug: string | null): Category =>
  CATEGORIES.find((c) => c.toLowerCase() === (slug ?? '').toLowerCase()) ?? 'All';

/** How the category reads mid-sentence: "Cheapest sushi near you", "Cheapest Chinese near you". */
export const CATEGORY_WORD: Record<Category, string> = {
  All: '',
  Pizza: 'pizza',
  Burgers: 'burgers',
  Chinese: 'Chinese',
  Mexican: 'Mexican',
  Sushi: 'sushi',
  Indian: 'Indian',
  Thai: 'Thai',
  Italian: 'Italian',
  Chicken: 'chicken',
  Sandwiches: 'sandwiches',
  Breakfast: 'breakfast',
  Healthy: 'healthy food',
  Desserts: 'desserts',
  Coffee: 'coffee',
  Vegan: 'vegan food',
  Halal: 'halal',
  Grocery: 'groceries',
};

/**
 * Other cuisine / dietary words that count as a category. A restaurant matches
 * when its category, a cuisine or a dietary tag equals one of these words (or
 * starts with it: "Vegan options" counts as vegan).
 */
const CATEGORY_ALIASES: Partial<Record<Category, string[]>> = {
  Burgers: ['burger'],
  Chinese: ['sichuan', 'cantonese', 'dim sum'],
  Mexican: ['tex-mex', 'tacos'],
  Sushi: ['poke'],
  Italian: ['pasta'],
  Chicken: ['wings', 'fried chicken'],
  Sandwiches: ['sandwich', 'deli', 'subs'],
  Breakfast: ['brunch', 'diner'],
  Healthy: ['salad'],
  Desserts: ['dessert', 'bakery', 'ice cream'],
  Coffee: ['cafe', 'café'],
  Grocery: ['supermarket', 'convenience'],
};

export function matchesCategory(r: Restaurant, cat: string): boolean {
  if (cat === 'All') return true;
  const words = [cat.toLowerCase(), ...(CATEGORY_ALIASES[cat as Category] ?? [])];
  const hay = [r.category ?? '', ...r.cuisine, ...r.dietaryTags].map((s) => s.toLowerCase());
  return hay.some((h) => words.some((w) => h === w || h.startsWith(`${w} `) || h.includes(w)));
}

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

export type FilterKey =
  | 'under15'
  | 'under20'
  | 'under25'
  | 'under30min'
  | 'vegan'
  | 'vegetarian'
  | 'halal'
  | 'glutenfree'
  | 'kosher';

export const FILTERS: { key: FilterKey; label: string; group: 'price' | 'time' | 'diet' }[] = [
  { key: 'under15', label: 'Under $15', group: 'price' },
  { key: 'under20', label: 'Under $20', group: 'price' },
  { key: 'under25', label: 'Under $25', group: 'price' },
  { key: 'under30min', label: 'Under 30 min', group: 'time' },
  { key: 'vegan', label: 'Vegan', group: 'diet' },
  { key: 'vegetarian', label: 'Vegetarian', group: 'diet' },
  { key: 'glutenfree', label: 'Gluten-free', group: 'diet' },
  { key: 'halal', label: 'Halal', group: 'diet' },
  { key: 'kosher', label: 'Kosher', group: 'diet' },
];

export const isFilterKey = (v: string): v is FilterKey => FILTERS.some((f) => f.key === v);

export function filtersFromParam(raw: string | null): FilterKey[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(isFilterKey);
}

/** Match API slugs (`vegan`) and mock labels (`Vegan options`) the same way. */
export function hasDietary(r: Restaurant, key: string): boolean {
  const aliases: Record<string, string[]> = {
    vegan: ['vegan'],
    vegetarian: ['vegetarian', 'vegan'],
    'gluten-free': ['gluten-free', 'gluten free', 'glutenfree'],
    glutenfree: ['gluten-free', 'gluten free', 'glutenfree'],
    halal: ['halal'],
    kosher: ['kosher'],
    'nut-free': ['nut-free', 'nut free', 'nutfree'],
  };
  const words = aliases[key] ?? [key];
  const hay = [...r.dietaryTags, ...r.cuisine].map((s) => s.toLowerCase());
  return words.some((w) => hay.some((h) => h === w || h.includes(w)));
}

const FILTER_FN: Record<FilterKey, (r: Restaurant) => boolean> = {
  under15: (r) => (bestOffer(r)?.total ?? Infinity) < 15,
  under20: (r) => (bestOffer(r)?.total ?? Infinity) < 20,
  under25: (r) => (bestOffer(r)?.total ?? Infinity) < 25,
  under30min: (r) => (fastestOffer(r)?.etaMin ?? Infinity) < 30,
  vegan: (r) => hasDietary(r, 'vegan'),
  vegetarian: (r) => hasDietary(r, 'vegetarian'),
  glutenfree: (r) => hasDietary(r, 'gluten-free'),
  halal: (r) => hasDietary(r, 'halal'),
  kosher: (r) => hasDietary(r, 'kosher'),
};

export const matchesFilters = (r: Restaurant, active: FilterKey[]) =>
  active.every((k) => FILTER_FN[k](r));

export type Sort = 'cheapest' | 'fastest' | 'rated' | 'cheapestFee';

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'rated', label: 'Rated' },
  { value: 'cheapestFee', label: 'Low fee' },
];

export const sortFromParam = (raw: string | null): Sort =>
  SORTS.some((s) => s.value === raw) ? (raw as Sort) : 'cheapest';

const SORT_FN: Record<Sort, (a: Restaurant, b: Restaurant) => number> = {
  cheapest: (a, b) => (bestOffer(a)?.total ?? 0) - (bestOffer(b)?.total ?? 0),
  fastest: (a, b) => (fastestOffer(a)?.etaMin ?? 0) - (fastestOffer(b)?.etaMin ?? 0),
  rated: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
  cheapestFee: (a, b) => (cheapestFeeOffer(a)?.deliveryFee ?? 0) - (cheapestFeeOffer(b)?.deliveryFee ?? 0),
};

export const sortBy = (list: Restaurant[], sort: Sort) => [...list].sort(SORT_FN[sort]);

/** Plain-language combined query: "Italian · under $20 · under 30 min". */
export function queryLabel(category: Category, active: FilterKey[], q = ''): string {
  const parts: string[] = [];
  if (q.trim()) parts.push(`“${q.trim()}”`);
  if (category !== 'All') parts.push(category);
  for (const key of active) {
    const f = FILTERS.find((x) => x.key === key);
    if (f) parts.push(f.label);
  }
  return parts.join(' · ');
}

/** HawtPix: saved places and taste prefs float a restaurant toward the top of "For you". */
export function hawtPixScore(r: Restaurant, prefs: Prefs): number {
  let score = 0;
  if (prefs.savedRestaurantIds.includes(r.id)) score += 8;
  if (prefs.favoriteCuisines.some((c) => matchesCategory(r, c))) score += 3;
  if (prefs.dietaryDefaults.some((d) => hasDietary(r, d))) score += 2;
  return score;
}

export function forYou(list: Restaurant[], prefs: Prefs, limit = 4): Restaurant[] {
  return [...list]
    .filter((r) => hawtPixScore(r, prefs) > 0)
    .sort((a, b) => hawtPixScore(b, prefs) - hawtPixScore(a, prefs) || (bestOffer(a)?.total ?? 0) - (bestOffer(b)?.total ?? 0))
    .slice(0, limit);
}
