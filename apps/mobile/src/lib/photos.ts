import type { ImageSourcePropType } from 'react-native';
import type { Restaurant } from '../types';

/**
 * Stock photos live in `assets/img/<slug>.jpg` and are bundled by Metro, so
 * the map has to be static `require` calls (no template paths). Same 20 files
 * as `apps/web/public/img`.
 */
const PHOTOS: Record<string, ImageSourcePropType> = {
  'bangkok-balcony': require('../../assets/img/bangkok-balcony.jpg'),
  'burgatory-waterfront': require('../../assets/img/burgatory-waterfront.jpg'),
  'cat-coffee': require('../../assets/img/cat-coffee.jpg'),
  'cat-healthy': require('../../assets/img/cat-healthy.jpg'),
  'cat-italian': require('../../assets/img/cat-italian.jpg'),
  'cat-vegan': require('../../assets/img/cat-vegan.jpg'),
  'daves-hot-chicken': require('../../assets/img/daves-hot-chicken.jpg'),
  'giant-eagle-market-district': require('../../assets/img/giant-eagle-market-district.jpg'),
  'mad-mex-shadyside': require('../../assets/img/mad-mex-shadyside.jpg'),
  'noodlehead': require('../../assets/img/noodlehead.jpg'),
  'pamelas-diner-oakland': require('../../assets/img/pamelas-diner-oakland.jpg'),
  'pizza-milano': require('../../assets/img/pizza-milano.jpg'),
  'prantls-bakery-shadyside': require('../../assets/img/prantls-bakery-shadyside.jpg'),
  'primanti-bros-oakland': require('../../assets/img/primanti-bros-oakland.jpg'),
  'prince-of-india': require('../../assets/img/prince-of-india.jpg'),
  'ramen-bar-oakland': require('../../assets/img/ramen-bar-oakland.jpg'),
  'salems-market-grill': require('../../assets/img/salems-market-grill.jpg'),
  'sichuan-gourmet': require('../../assets/img/sichuan-gourmet.jpg'),
  'sushi-fuku': require('../../assets/img/sushi-fuku.jpg'),
  'whole-foods-east-liberty': require('../../assets/img/whole-foods-east-liberty.jpg'),
};

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

const isHttp = (s: string) => /^https?:\/\//i.test(s);

/**
 * Image source for a restaurant: an `http(s)` `imageUrl` (live API listing) is
 * loaded from the network; a bare slug (mock data) or a known category maps to
 * a bundled asset; otherwise undefined and the caller draws the gradient art.
 */
export function restaurantPhoto(r: Restaurant): ImageSourcePropType | undefined {
  if (r.imageUrl) {
    if (isHttp(r.imageUrl)) return { uri: r.imageUrl };
    const own = PHOTOS[r.imageUrl];
    if (own) return own;
  }
  const keys = [r.category ?? '', ...r.cuisine].map((k) => k.toLowerCase());
  const slug = keys.map((k) => CATEGORY_PHOTO[k]).find(Boolean);
  return slug ? PHOTOS[slug] : undefined;
}
