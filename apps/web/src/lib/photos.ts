import type { Restaurant } from '../types';

/**
 * Stock photos live in `public/img/<slug>.jpg`. Resolving against the build
 * base keeps them working for both the normal build and `vite build --base ./`.
 */
export const photoUrl = (slug: string) => `${import.meta.env.BASE_URL}img/${slug}.jpg`;

/**
 * One photo per home-screen category. Used when a listing comes in without a
 * photo of its own (the scrapers miss one now and then): a plate that matches
 * the cuisine beats a gradient. Most reuse a seed restaurant's photo.
 */
const CATEGORY_PHOTO: Record<string, string> = {
  pizza: 'pizza-milano',
  burgers: 'burgatory-waterfront',
  chinese: 'sichuan-gourmet',
  mexican: 'mad-mex-shadyside',
  sushi: 'sushi-fuku',
  indian: 'prince-of-india',
  thai: 'bangkok-balcony',
  italian: 'cat-italian',
  chicken: 'daves-hot-chicken',
  sandwiches: 'primanti-bros-oakland',
  breakfast: 'pamelas-diner-oakland',
  healthy: 'cat-healthy',
  desserts: 'prantls-bakery-shadyside',
  coffee: 'cat-coffee',
  vegan: 'cat-vegan',
  halal: 'salems-market-grill',
  grocery: 'giant-eagle-market-district',
  ramen: 'ramen-bar-oakland',
  noodles: 'noodlehead',
};

/** The listing's own photo, else the photo for its category or first matching cuisine, else nothing (gradient). */
export function restaurantPhoto(r: Restaurant): string | undefined {
  if (r.imageUrl) return r.imageUrl;
  const keys = [r.category ?? '', ...r.cuisine].map((k) => k.toLowerCase());
  const slug = keys.map((k) => CATEGORY_PHOTO[k]).find(Boolean);
  return slug ? photoUrl(slug) : undefined;
}
