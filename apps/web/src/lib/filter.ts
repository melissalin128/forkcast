import { bestOffer, fastestOffer } from './analysis';
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
  return hay.some((h) => words.some((w) => h === w || h.startsWith(`${w} `)));
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
