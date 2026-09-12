/** Shared view helpers so the React and Expo clients get the same category and dietary labels. */

export const CATEGORY_HINTS: { name: string; words: string[] }[] = [
  { name: 'Grocery', words: ['grocery', 'supermarket', 'convenience'] },
  { name: 'Pizza', words: ['pizza'] },
  { name: 'Burgers', words: ['burger', 'burgers'] },
  { name: 'Chinese', words: ['chinese', 'sichuan', 'cantonese', 'dim sum'] },
  { name: 'Mexican', words: ['mexican', 'tex-mex', 'tacos'] },
  { name: 'Sushi', words: ['sushi', 'poke'] },
  { name: 'Indian', words: ['indian'] },
  { name: 'Thai', words: ['thai'] },
  { name: 'Italian', words: ['italian', 'pasta'] },
  { name: 'Chicken', words: ['chicken', 'wings'] },
  { name: 'Sandwiches', words: ['sandwich', 'sandwiches', 'deli', 'subs'] },
  { name: 'Breakfast', words: ['breakfast', 'brunch', 'diner'] },
  { name: 'Healthy', words: ['healthy', 'salad', 'salads'] },
  { name: 'Desserts', words: ['dessert', 'desserts', 'bakery', 'ice cream', 'waffle'] },
  { name: 'Coffee', words: ['coffee', 'cafe', 'café'] },
  { name: 'Vegan', words: ['vegan'] },
  { name: 'Halal', words: ['halal'] },
  { name: 'Ramen', words: ['ramen', 'noodles'] },
];

const DIETARY_LABEL: Record<string, string> = {
  vegan: 'Vegan options',
  vegetarian: 'Vegetarian options',
  'gluten-free': 'Gluten-free options',
  halal: 'Halal',
  kosher: 'Kosher',
  'nut-free': 'Nut-free',
};

export function inferCategory(cuisine: string[]): string {
  const hay = cuisine.map((c) => c.toLowerCase());
  for (const hint of CATEGORY_HINTS) {
    if (hay.some((h) => hint.words.some((w) => h === w || h.includes(w)))) return hint.name;
  }
  return cuisine[0] ?? 'All';
}

/** API stores lowercase tags; the clients also ship title-case mock labels. */
export function displayDietaryTags(tags: string[]): string[] {
  return tags.map((t) => DIETARY_LABEL[t.toLowerCase()] ?? t);
}
