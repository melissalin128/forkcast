/**
 * Demo catalog: 3 platforms, ~40 Pittsburgh restaurants around CMU
 * (Oakland 15213, Squirrel Hill 15217, Shadyside 15232) and 6 live promos.
 * Everything here is deterministic so seeding is idempotent.
 */
import type { DietaryTag, Platform, PlatformSlug, Promo, Restaurant } from '../models/types';

export const platforms: Platform[] = [
  {
    slug: 'doordash',
    name: 'DoorDash',
    brandColor: '#FF3008',
    subscriptionName: 'DashPass',
    subscriptionSlug: 'dashpass',
    subscriptionPerks: ['$0 delivery fee on orders $12+', 'Reduced service fees (5%)'],
  },
  {
    slug: 'ubereats',
    name: 'Uber Eats',
    brandColor: '#06C167',
    subscriptionName: 'Uber One',
    subscriptionSlug: 'uberone',
    subscriptionPerks: ['$0 delivery fee on orders $15+', 'Reduced service fees (5%)'],
  },
  {
    slug: 'grubhub',
    name: 'Grubhub',
    brandColor: '#F63440',
    subscriptionName: 'Grubhub+',
    subscriptionSlug: 'grubhubplus',
    subscriptionPerks: ['$0 delivery fee on orders $12+'],
  },
];

/** Zip centroids used to scatter restaurants believably. */
export const ZIP_CENTROIDS: Record<string, { lat: number; lng: number; neighborhood: string }> = {
  '15213': { lat: 40.4406, lng: -79.9559, neighborhood: 'Oakland' },
  '15217': { lat: 40.4302, lng: -79.9224, neighborhood: 'Squirrel Hill' },
  '15232': { lat: 40.4514, lng: -79.933, neighborhood: 'Shadyside' },
};

/** FNV-1a 32-bit — tiny, stable hash for deterministic ids and jitter. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic float in [0, 1) from a string key. */
export const unit = (key: string): number => fnv1a(key) / 0x100000000;

type Listing = 'dd' | 'ue' | 'gh';

interface Row {
  name: string;
  address: string;
  zip: string;
  cuisine: string[];
  dietary?: DietaryTag[];
  rating: number;
  ratingCount: number;
  priceTier: 1 | 2 | 3;
  item: string;
  price: number;
  /** Which platforms list it. Default: all three. */
  on?: Listing[];
}

// A ~40-row catalog of real Pittsburgh spots. Ratings/prices are plausible, not scraped.
const rows: Row[] = [
  // ---- Oakland 15213 --------------------------------------------------------
  { name: "Pamela's P&G Diner", address: '3703 Forbes Ave', zip: '15213', cuisine: ['American', 'Breakfast'], dietary: ['vegetarian'], rating: 4.6, ratingCount: 2140, priceTier: 2, item: 'Lyonnaise Potatoes & Crepe Hotcakes', price: 13.5 },
  { name: 'Primanti Bros. Oakland', address: '3803 Forbes Ave', zip: '15213', cuisine: ['Sandwiches', 'American'], rating: 4.4, ratingCount: 3120, priceTier: 2, item: 'Pitts-burger Cheesesteak', price: 12.99 },
  { name: 'Fuel and Fuddle', address: '212 Oakland Ave', zip: '15213', cuisine: ['American', 'Burgers', 'Pizza'], dietary: ['vegetarian'], rating: 4.3, ratingCount: 1480, priceTier: 2, item: 'Fuddle Burger & Fries', price: 15.5 },
  { name: 'Lucca Ristorante', address: '317 S Craig St', zip: '15213', cuisine: ['Italian'], dietary: ['vegetarian', 'gluten-free'], rating: 4.5, ratingCount: 620, priceTier: 3, item: 'Gnocchi alla Sorrentina', price: 24 },
  { name: 'Ali Baba', address: '404 S Craig St', zip: '15213', cuisine: ['Middle Eastern', 'Mediterranean'], dietary: ['halal', 'vegetarian', 'vegan'], rating: 4.4, ratingCount: 910, priceTier: 2, item: 'Chicken Shawarma Platter', price: 16.95 },
  { name: 'Sushi Fuku', address: '120 Oakland Ave', zip: '15213', cuisine: ['Japanese', 'Sushi', 'Poke'], dietary: ['gluten-free'], rating: 4.3, ratingCount: 1890, priceTier: 1, item: 'Build-Your-Own Sushi Burrito', price: 12.45 },
  { name: "Chick'n Bubbly", address: '3609 Forbes Ave', zip: '15213', cuisine: ['Korean', 'Chicken'], rating: 4.5, ratingCount: 1330, priceTier: 2, item: 'Half & Half Boneless Chicken', price: 16.99 },
  { name: 'Sichuan Gourmet', address: '328 Atwood St', zip: '15213', cuisine: ['Chinese', 'Sichuan'], dietary: ['vegetarian'], rating: 4.4, ratingCount: 1120, priceTier: 2, item: 'Mapo Tofu with Rice', price: 15.95, on: ['dd', 'ue'] },
  { name: 'Prince of India', address: '3614 Fifth Ave', zip: '15213', cuisine: ['Indian'], dietary: ['halal', 'vegetarian', 'vegan', 'gluten-free'], rating: 4.2, ratingCount: 770, priceTier: 2, item: 'Chicken Tikka Masala', price: 17.5 },
  { name: "Stack'd Burgers", address: '3716 Forbes Ave', zip: '15213', cuisine: ['Burgers', 'American'], dietary: ['gluten-free'], rating: 4.2, ratingCount: 1010, priceTier: 2, item: 'Double Stack with Bacon', price: 14.25, on: ['dd', 'gh'] },
  { name: 'Mad Mex Oakland', address: '370 Atwood St', zip: '15213', cuisine: ['Mexican', 'Tex-Mex'], dietary: ['vegetarian', 'vegan', 'gluten-free'], rating: 4.1, ratingCount: 1540, priceTier: 2, item: 'Big Azz Chicken Burrito', price: 16.5 },
  { name: 'The Porch at Schenley', address: '221 Schenley Dr', zip: '15213', cuisine: ['American', 'Pizza'], dietary: ['vegetarian', 'gluten-free'], rating: 4.4, ratingCount: 980, priceTier: 3, item: 'Wood-Fired Margherita', price: 19 },
  { name: 'Pizza Romano', address: '3719 Forbes Ave', zip: '15213', cuisine: ['Pizza', 'Italian'], dietary: ['vegetarian'], rating: 4.0, ratingCount: 640, priceTier: 1, item: 'Large Cheese Pizza', price: 14.99, on: ['ue', 'gh'] },
  { name: 'Union Grill', address: '413 S Craig St', zip: '15213', cuisine: ['American'], rating: 4.3, ratingCount: 720, priceTier: 2, item: 'Cedar Plank Salmon', price: 22 },
  { name: 'Oishii Bento', address: '119 Oakland Ave', zip: '15213', cuisine: ['Japanese', 'Korean'], dietary: ['vegetarian'], rating: 4.4, ratingCount: 1280, priceTier: 1, item: 'Chicken Katsu Bento', price: 11.95 },
  { name: 'Hello Bistro', address: '3605 Forbes Ave', zip: '15213', cuisine: ['Salads', 'Burgers', 'Healthy'], dietary: ['vegetarian', 'vegan', 'gluten-free'], rating: 4.2, ratingCount: 560, priceTier: 2, item: 'Build-Your-Own Salad', price: 12.75 },
  { name: 'Eat Unique', address: '305 S Craig St', zip: '15213', cuisine: ['Sandwiches', 'Salads'], dietary: ['vegetarian', 'vegan'], rating: 4.5, ratingCount: 830, priceTier: 2, item: 'Turkey Avocado Sandwich', price: 13.25, on: ['dd', 'gh'] },
  { name: 'Halal Bros Oakland', address: '3617 Forbes Ave', zip: '15213', cuisine: ['Halal', 'Middle Eastern'], dietary: ['halal'], rating: 4.3, ratingCount: 410, priceTier: 1, item: 'Chicken over Rice', price: 10.99, on: ['ue', 'gh'] },

  // ---- Squirrel Hill 15217 --------------------------------------------------
  { name: 'Bangkok Balcony', address: '5846 Forbes Ave', zip: '15217', cuisine: ['Thai'], dietary: ['vegetarian', 'vegan', 'gluten-free'], rating: 4.5, ratingCount: 1160, priceTier: 2, item: 'Pad Thai with Chicken', price: 16.95 },
  { name: 'Rose Tea Cafe', address: '5874 Forbes Ave', zip: '15217', cuisine: ['Taiwanese', 'Bubble Tea'], dietary: ['vegetarian'], rating: 4.4, ratingCount: 1380, priceTier: 1, item: 'Three Cup Chicken', price: 13.95 },
  { name: "Aiello's Pizza", address: '2112 Murray Ave', zip: '15217', cuisine: ['Pizza', 'Italian'], dietary: ['vegetarian'], rating: 4.4, ratingCount: 1720, priceTier: 1, item: 'Large Pepperoni Pizza', price: 17.5 },
  { name: "Mineo's Pizza House", address: '2128 Murray Ave', zip: '15217', cuisine: ['Pizza', 'Italian'], dietary: ['vegetarian'], rating: 4.5, ratingCount: 2210, priceTier: 1, item: 'Large Cheese Pizza', price: 16.99 },
  { name: 'Everyday Noodles', address: '5875 Forbes Ave', zip: '15217', cuisine: ['Chinese', 'Noodles', 'Dumplings'], rating: 4.6, ratingCount: 1650, priceTier: 2, item: 'Xiao Long Bao & Beef Noodle Soup', price: 22.5 },
  { name: 'Silk Elephant', address: '1712 Murray Ave', zip: '15217', cuisine: ['Thai'], dietary: ['vegetarian', 'vegan', 'gluten-free'], rating: 4.3, ratingCount: 690, priceTier: 2, item: 'Green Curry', price: 17.5, on: ['dd', 'ue'] },
  { name: 'Chengdu Gourmet', address: '5840 Forbes Ave', zip: '15217', cuisine: ['Chinese', 'Sichuan'], dietary: ['vegetarian'], rating: 4.5, ratingCount: 1490, priceTier: 2, item: 'Dry Pot Chicken', price: 19.95 },
  { name: 'Waffallonia', address: '1707 Murray Ave', zip: '15217', cuisine: ['Dessert', 'Waffles'], dietary: ['vegetarian'], rating: 4.7, ratingCount: 930, priceTier: 1, item: 'Liege Waffle with Nutella & Strawberries', price: 9.5, on: ['dd', 'ue'] },
  { name: 'Napoli Pizzeria', address: '5822 Forbes Ave', zip: '15217', cuisine: ['Pizza', 'Italian'], dietary: ['vegetarian'], rating: 4.0, ratingCount: 480, priceTier: 1, item: 'Large Cheese Pizza', price: 15.5, on: ['gh'] },
  { name: 'Milky Way', address: '2120 Murray Ave', zip: '15217', cuisine: ['Pizza', 'Kosher', 'Vegetarian'], dietary: ['kosher', 'vegetarian'], rating: 4.2, ratingCount: 360, priceTier: 1, item: 'Falafel Pizza', price: 16 , on: ['dd', 'gh'] },
  { name: 'Squirrel Hill Cafe', address: '5802 Forbes Ave', zip: '15217', cuisine: ['American', 'Bar'], rating: 4.1, ratingCount: 540, priceTier: 1, item: 'Cage Burger', price: 11.5, on: ['ue', 'gh'] },
  { name: 'How Lee', address: '5888 Forbes Ave', zip: '15217', cuisine: ['Chinese', 'Sichuan'], dietary: ['vegetarian'], rating: 4.3, ratingCount: 870, priceTier: 2, item: 'Cumin Lamb', price: 18.95 },
  { name: 'Curry on Murray', address: '2121 Murray Ave', zip: '15217', cuisine: ['Indian', 'Thai'], dietary: ['vegetarian', 'vegan', 'gluten-free'], rating: 4.3, ratingCount: 710, priceTier: 2, item: 'Lamb Vindaloo', price: 18.5 },
  { name: 'Naya Cuisine', address: '2018 Murray Ave', zip: '15217', cuisine: ['Middle Eastern', 'Syrian'], dietary: ['halal', 'vegetarian', 'vegan'], rating: 4.5, ratingCount: 520, priceTier: 2, item: 'Mixed Grill Platter', price: 21 },
  { name: 'Taiwanese Bistro Cafe 33', address: '1711 Shady Ave', zip: '15217', cuisine: ['Taiwanese', 'Chinese'], rating: 4.4, ratingCount: 780, priceTier: 2, item: 'Pork Chop over Rice', price: 14.5 },
  { name: "Aladdin's Eatery", address: '5878 Forbes Ave', zip: '15217', cuisine: ['Lebanese', 'Mediterranean'], dietary: ['vegetarian', 'vegan', 'gluten-free', 'halal'], rating: 4.4, ratingCount: 1210, priceTier: 2, item: 'Chicken Shawarma Rolled Pita', price: 13.75 },
  { name: 'Chaya Japanese Cuisine', address: '2104 Murray Ave', zip: '15217', cuisine: ['Japanese', 'Sushi'], dietary: ['gluten-free'], rating: 4.5, ratingCount: 640, priceTier: 3, item: 'Chirashi Bowl', price: 26 },

  // ---- Shadyside 15232 ------------------------------------------------------
  { name: 'Noodlehead', address: '314 S Highland Ave', zip: '15232', cuisine: ['Thai', 'Noodles'], dietary: ['vegetarian', 'vegan'], rating: 4.6, ratingCount: 2380, priceTier: 1, item: 'Khao Soi', price: 14 },
  { name: "Mercurio's", address: '5523 Walnut St', zip: '15232', cuisine: ['Pizza', 'Italian', 'Dessert'], dietary: ['vegetarian'], rating: 4.5, ratingCount: 1290, priceTier: 2, item: 'Margherita Pizza & Gelato', price: 21 },
  { name: 'Girasole', address: '733 Copeland St', zip: '15232', cuisine: ['Italian'], dietary: ['vegetarian'], rating: 4.5, ratingCount: 560, priceTier: 3, item: 'Housemade Pappardelle', price: 26, on: ['dd', 'ue'] },
  { name: 'Casbah', address: '229 S Highland Ave', zip: '15232', cuisine: ['Mediterranean', 'American'], dietary: ['vegetarian', 'gluten-free'], rating: 4.4, ratingCount: 830, priceTier: 3, item: 'Lamb Tagine', price: 32, on: ['dd', 'gh'] },
  { name: "Pamela's Diner Shadyside", address: '5527 Walnut St', zip: '15232', cuisine: ['American', 'Breakfast'], dietary: ['vegetarian'], rating: 4.5, ratingCount: 1610, priceTier: 2, item: 'Crepe Hotcakes & Bacon', price: 13.5 },
  { name: 'Steel Cactus', address: '5505 Walnut St', zip: '15232', cuisine: ['Mexican'], dietary: ['vegetarian', 'gluten-free'], rating: 4.0, ratingCount: 970, priceTier: 2, item: 'Carnitas Tacos (3)', price: 15.5 },
  { name: 'Soba', address: '5847 Ellsworth Ave', zip: '15232', cuisine: ['Pan-Asian', 'Japanese'], dietary: ['gluten-free', 'vegetarian'], rating: 4.4, ratingCount: 690, priceTier: 3, item: 'Miso Black Cod', price: 34, on: ['ue'] },
  { name: "Cappy's Cafe", address: '5431 Walnut St', zip: '15232', cuisine: ['American', 'Bar', 'Burgers'], rating: 4.2, ratingCount: 510, priceTier: 1, item: "Cappy's Burger", price: 12.5, on: ['dd', 'gh'] },
  { name: 'Harris Grill', address: '5747 Ellsworth Ave', zip: '15232', cuisine: ['American', 'Bar'], dietary: ['vegetarian'], rating: 4.2, ratingCount: 880, priceTier: 2, item: 'Bacon Night Mac & Cheese', price: 16 },
  { name: 'Cafe Moulin', address: '732 Filbert St', zip: '15232', cuisine: ['French', 'Crepes', 'Breakfast'], dietary: ['vegetarian', 'gluten-free'], rating: 4.6, ratingCount: 430, priceTier: 2, item: 'Savory Ham & Gruyere Crepe', price: 14.5, on: ['dd', 'ue'] },
  { name: "Millie's Homemade Ice Cream", address: '232 S Highland Ave', zip: '15232', cuisine: ['Dessert', 'Ice Cream'], dietary: ['vegetarian', 'vegan', 'gluten-free', 'nut-free'], rating: 4.7, ratingCount: 1120, priceTier: 1, item: 'Two-Scoop Pint Pair', price: 12 },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '') // "Pamela's" -> "pamelas", not "pamela-s"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Platform-specific store id that looks like the real thing (deterministic). */
export function platformStoreId(platform: PlatformSlug, slug: string): string {
  const h = fnv1a(`${platform}:${slug}`);
  switch (platform) {
    case 'doordash':
      return `dd-${(h % 9_000_000) + 1_000_000}`;
    case 'ubereats':
      return `ue-${h.toString(16).padStart(8, '0')}`;
    case 'grubhub':
      return `gh-${(h % 900_000) + 100_000}`;
  }
}

const LISTING_TO_SLUG: Record<Listing, PlatformSlug> = { dd: 'doordash', ue: 'ubereats', gh: 'grubhub' };

export const restaurants: Restaurant[] = rows.map((r) => {
  const slug = slugify(r.name);
  const centroid = ZIP_CENTROIDS[r.zip];
  const on = r.on ?? ['dd', 'ue', 'gh'];
  const platformIds: Partial<Record<PlatformSlug, string>> = {};
  for (const l of on) {
    const p = LISTING_TO_SLUG[l];
    platformIds[p] = platformStoreId(p, slug);
  }
  return {
    id: slug,
    slug,
    name: r.name,
    address: r.address,
    cuisine: r.cuisine,
    dietaryTags: r.dietary ?? [],
    rating: r.rating,
    ratingCount: r.ratingCount,
    priceTier: r.priceTier,
    location: {
      zip: r.zip,
      geo: {
        lat: +(centroid.lat + (unit(`lat:${slug}`) - 0.5) * 0.012).toFixed(5),
        lng: +(centroid.lng + (unit(`lng:${slug}`) - 0.5) * 0.016).toFixed(5),
      },
    },
    platformIds,
    sampleItem: { name: r.item, menuPrice: r.price },
    imageUrl: `https://picsum.photos/seed/${slug}/640/400`,
  };
});

const DAY = 24 * 60 * 60 * 1000;

/**
 * Six live promos. Dates are relative to "now" at module load so the demo
 * always has active promos; seeding upserts by (platformSlug, code) so the
 * window refreshes each time `npm run seed` runs.
 */
export function buildPromos(now: Date = new Date()): Promo[] {
  const t = now.getTime();
  return [
    { platformSlug: 'doordash', code: 'WEEKNIGHT20', description: '20% off orders $25+', rule: { type: 'percent', value: 20, minSubtotal: 25 }, startsAt: new Date(t - 2 * DAY), endsAt: new Date(t + 5 * DAY) },
    { platformSlug: 'doordash', code: 'DASHFREE', description: 'Free delivery on orders $15+', rule: { type: 'freeDelivery', value: 0, minSubtotal: 15 }, startsAt: new Date(t - 1 * DAY), endsAt: new Date(t + 3 * DAY) },
    { platformSlug: 'ubereats', code: 'EATS5', description: '$5 off orders $20+', rule: { type: 'flat', value: 5, minSubtotal: 20 }, startsAt: new Date(t - 3 * DAY), endsAt: new Date(t + 4 * DAY) },
    { platformSlug: 'ubereats', code: 'UBER25', description: '25% off orders $30+', rule: { type: 'percent', value: 25, minSubtotal: 30 }, startsAt: new Date(t - 1 * DAY), endsAt: new Date(t + 2 * DAY) },
    { platformSlug: 'grubhub', code: 'GRUB10', description: '$10 off orders $35+', rule: { type: 'flat', value: 10, minSubtotal: 35 }, startsAt: new Date(t - 2 * DAY), endsAt: new Date(t + 6 * DAY) },
    { platformSlug: 'grubhub', code: 'FREEDELIV', description: 'Free delivery on orders $12+', rule: { type: 'freeDelivery', value: 0, minSubtotal: 12 }, startsAt: new Date(t - 1 * DAY), endsAt: new Date(t + 1.5 * DAY) },
    // one expired promo so the "active" filter is visibly doing something
    { platformSlug: 'doordash', code: 'SUMMER15', description: '15% off (expired)', rule: { type: 'percent', value: 15, minSubtotal: 0 }, startsAt: new Date(t - 30 * DAY), endsAt: new Date(t - 10 * DAY) },
  ];
}

export const promos: Promo[] = buildPromos();

/** Find a seed restaurant by the id it carries on a given platform. */
export function findByPlatformId(platform: PlatformSlug, platformRestaurantId: string): Restaurant | undefined {
  return restaurants.find((r) => r.platformIds[platform] === platformRestaurantId);
}
