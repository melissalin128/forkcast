import type { Restaurant } from '../types';

/**
 * Stock photos are hosted on Cloudinary (uploaded from what used to be
 * `public/img/<slug>.jpg`) so they survive deployment without relying on
 * Git LFS being pulled by the host. The cloud name isn't a secret — it's
 * part of every image's public URL — so it's fine to hardcode here.
 */
const CLOUDINARY_CLOUD_NAME = 'kieg88kv';
export const photoUrl = (slug: string) =>
  `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${slug}.jpg`;

/**
 * One photo per home-screen category. Used when a listing comes in without a
 * photo of its own (the scrapers miss one now and then): a plate that matches
 * the cuisine beats a gradient. Most reuse a seed restaurant's photo.
 */
const CATEGORY_PHOTO: Record<string, string> = {
  american: 'burgatory-waterfront',
  bar: 'burgatory-waterfront',
  pizza: 'pizza-milano',
  burgers: 'burgatory-waterfront',
  chinese: 'sichuan-gourmet',
  mexican: 'mad-mex-shadyside',
  sushi: 'sushi-fuku',
  japanese: 'sushi-fuku',
  indian: 'prince-of-india',
  thai: 'bangkok-balcony',
  italian: 'cat-italian',
  chicken: 'daves-hot-chicken',
  korean: 'daves-hot-chicken',
  sandwiches: 'primanti-bros-oakland',
  breakfast: 'pamelas-diner-oakland',
  healthy: 'cat-healthy',
  salads: 'cat-healthy',
  dessert: 'prantls-bakery-shadyside',
  desserts: 'prantls-bakery-shadyside',
  coffee: 'cat-coffee',
  vegan: 'cat-vegan',
  halal: 'salems-market-grill',
  lebanese: 'salems-market-grill',
  mediterranean: 'salems-market-grill',
  'middle eastern': 'salems-market-grill',
  taiwanese: 'noodlehead',
  french: 'pamelas-diner-oakland',
  'pan-asian': 'sushi-fuku',
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
