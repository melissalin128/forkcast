import type {
  MenuItem,
  Offer,
  OrderLine,
  Platform,
  PlatformSlug,
  PriceSnapshot,
  Promo,
  Restaurant,
} from '../types';
import { photoUrl } from '../lib/photos';

/**
 * Demo anchor. The artboards describe "Friday 7:12 pm is a peak hour", so the
 * mock world is frozen there: prices, the chart's "now" marker and the
 * best-time callout all derive from this instant. Built with the local-time
 * constructor so the weekday is Friday in every timezone.
 */
export const NOW = new Date(2026, 8, 11, 19, 12, 0);
export const ZIP = '15213';
/** Zips the sample prices cover. Every seed restaurant is listed in all of them. */
export const COVERED_ZIPS = ['15213', '15217', '15232'] as const;
export const REFRESHED_AT = new Date(NOW.getTime() - 3 * 60_000).toISOString();

/**
 * Passes the sample totals were priced with. None: totals are what you pay
 * without a subscription; `applyPrefs` waives the delivery fee where you hold one.
 */
export const USER_SUBSCRIPTIONS: PlatformSlug[] = [];

export const PLATFORMS: Platform[] = [
  {
    slug: 'doordash',
    name: 'DoorDash',
    brandColor: '#ff3008',
    subscriptionName: 'DashPass',
    subscriptionPerks: ['$0 delivery fee', 'reduced service fee'],
    deepLink: 'https://www.doordash.com/search/store/{q}/',
  },
  {
    slug: 'ubereats',
    name: 'Uber Eats',
    brandColor: '#06c167',
    subscriptionName: 'Uber One',
    subscriptionPerks: ['$0 delivery fee on $15+', '5% off eligible orders'],
    deepLink: 'https://www.ubereats.com/search?q={q}',
  },
  {
    slug: 'grubhub',
    name: 'Grubhub',
    brandColor: '#f63440',
    subscriptionName: 'Grubhub+',
    subscriptionPerks: ['$0 delivery fee on $12+', '5% back in credit'],
    deepLink: 'https://www.grubhub.com/search?queryText={q}',
  },
];

export const PLATFORM_BY_SLUG: Record<PlatformSlug, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.slug, p]),
) as Record<PlatformSlug, Platform>;

// ---------------------------------------------------------------------------
// Promos (spec D4: first-class and time-bounded)
// ---------------------------------------------------------------------------

const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

export const PROMOS: Record<string, Promo> = {
  GH2OFF: {
    platformSlug: 'grubhub',
    code: 'GH2OFF',
    rule: { type: 'flat', value: 2, minSubtotal: 15 },
    startsAt: hoursFromNow(-3.3),
    endsAt: hoursFromNow(2.67),
    label: '$2 off $15+',
    eligible: true,
  },
  EATS20: {
    platformSlug: 'ubereats',
    code: 'EATS20',
    rule: { type: 'percent', value: 20 },
    startsAt: hoursFromNow(-48),
    endsAt: hoursFromNow(120),
    label: '20% off first order',
    eligible: false,
    note: 'you have ordered before',
  },
  SPICY20: {
    platformSlug: 'ubereats',
    code: 'SPICY20',
    rule: { type: 'percent', value: 20, minSubtotal: 20 },
    startsAt: hoursFromNow(-5),
    endsAt: hoursFromNow(1.5),
    label: '20% off $20+',
    eligible: true,
  },
  DDFREE: {
    platformSlug: 'doordash',
    code: 'DASHFREE',
    rule: { type: 'freeDelivery', value: 0, minSubtotal: 12 },
    startsAt: hoursFromNow(-24),
    endsAt: hoursFromNow(6),
    label: 'Free delivery on $12+',
    eligible: false,
    note: 'already included in DashPass',
  },
};

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

interface OfferSeed {
  subtotal: number;
  /** service + delivery + small-order + tax + tip, as one number for readability. */
  fees: number;
  promo?: Promo;
  eta: [number, number];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function makeOffer(restaurantId: string, slug: PlatformSlug, seed: OfferSeed): Offer {
  const subscriptionApplied = USER_SUBSCRIPTIONS.includes(slug);
  const tip = round2(seed.subtotal * 0.15);
  const tax = round2(seed.subtotal * 0.07);
  const remainder = Math.max(0, round2(seed.fees - tip - tax));
  // With a pass the delivery fee is waived and everything left is service fee.
  const deliveryFee = subscriptionApplied ? 0 : round2(Math.min(remainder, 2.99));
  const smallOrderFee = seed.subtotal < 12 ? 2 : 0;
  const serviceFee = round2(remainder - deliveryFee - smallOrderFee);
  const promoDiscount = seed.promo
    ? seed.promo.rule.type === 'percent'
      ? round2(seed.subtotal * (seed.promo.rule.value / 100))
      : seed.promo.rule.type === 'flat'
        ? seed.promo.rule.value
        : deliveryFee
    : 0;
  return {
    restaurantId,
    platformSlug: slug,
    subtotal: seed.subtotal,
    serviceFee,
    deliveryFee,
    smallOrderFee,
    tax,
    tip,
    promoDiscount,
    total: round2(seed.subtotal + seed.fees - promoDiscount),
    etaMin: seed.eta[0],
    etaMax: seed.eta[1],
    promo: seed.promo,
    subscriptionApplied,
    fetchedAt: REFRESHED_AT,
  };
}

interface RestaurantSeed {
  id: string;
  name: string;
  /** Home-screen category chip. */
  category: string;
  cuisine: string[];
  dietaryTags: string[];
  rating: number;
  ratingCount: number;
  priceTier: 1 | 2 | 3;
  distanceMi: number;
  openUntil: string;
  /** Gradient art, shown only if the photo (`public/img/<id>.jpg`) fails to load. */
  image: string;
  order: OrderLine[];
  orderLabel: string;
  /** Menu lines at the restaurant's own price; platform prices are derived from each offer's markup. */
  menu: [string, number][];
  /** How hard dinner peak hits this restaurant's totals, in dollars. */
  peakAmp: number;
  offers: Partial<Record<PlatformSlug, OfferSeed>>;
}

const SEEDS: RestaurantSeed[] = [
  {
    id: 'ramen-bar-oakland',
    name: 'Ramen Bar Oakland',
    category: 'Ramen',
    cuisine: ['Ramen', 'Japanese'],
    dietaryTags: [],
    rating: 4.7,
    ratingCount: 1240,
    priceTier: 2,
    distanceMi: 0.6,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #f6dcc6, #e9b48c)',
    order: [
      { name: 'Tonkotsu ramen', qty: 1 },
      { name: 'Pork gyoza (6)', qty: 1 },
    ],
    orderLabel: 'Tonkotsu ramen + gyoza, delivered',
    menu: [
      ['Tonkotsu ramen', 14.5],
      ['Shoyu ramen', 13.0],
      ['Spicy miso ramen', 15.0],
      ['Pork gyoza (6)', 6.5],
      ['Karaage', 7.0],
      ['Seaweed salad', 5.0],
      ['Ramune soda', 3.0],
    ],
    peakAmp: 2.4,
    offers: {
      grubhub: { subtotal: 18.5, fees: 4.9, promo: PROMOS.GH2OFF, eta: [28, 38] },
      doordash: { subtotal: 19.75, fees: 5.1, eta: [24, 34] },
      ubereats: { subtotal: 20.9, fees: 5.6, eta: [31, 41] },
    },
  },
  {
    id: 'mad-mex-shadyside',
    name: 'Mad Mex Shadyside',
    category: 'Mexican',
    cuisine: ['Mexican', 'Tex-Mex'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.5,
    ratingCount: 860,
    priceTier: 2,
    distanceMi: 1.1,
    openUntil: '11 pm',
    image: 'linear-gradient(135deg, #f7d9b8, #e8a86d)',
    order: [
      { name: 'Big Azz Burrito', qty: 1 },
      { name: 'Chips & queso', qty: 1 },
    ],
    orderLabel: 'Burrito + chips & queso, delivered',
    menu: [
      ['Big Azz Burrito', 12.5],
      ['Chicken quesadilla', 10.5],
      ['Carnitas tacos (3)', 11.0],
      ['Chips & queso', 6.5],
      ['Guacamole', 5.5],
      ['Churros', 5.0],
    ],
    peakAmp: 1.8,
    offers: {
      doordash: { subtotal: 14.95, fees: 4.0, eta: [22, 32] },
      ubereats: { subtotal: 15.6, fees: 4.5, eta: [26, 36] },
      grubhub: { subtotal: 16.25, fees: 5.9, eta: [35, 45] },
    },
  },
  {
    id: 'sichuan-gourmet',
    name: 'Sichuan Gourmet',
    category: 'Chinese',
    cuisine: ['Chinese', 'Sichuan'],
    dietaryTags: ['Vegan options'],
    rating: 4.6,
    ratingCount: 2300,
    priceTier: 2,
    distanceMi: 0.9,
    openUntil: '9:30 pm',
    image: 'linear-gradient(135deg, #f3dad0, #e59a86)',
    order: [
      { name: 'Mapo tofu', qty: 1 },
      { name: 'Dan dan noodles', qty: 1 },
    ],
    orderLabel: 'Mapo tofu + dan dan noodles, delivered',
    menu: [
      ['Mapo tofu', 13.0],
      ['Dan dan noodles', 11.5],
      ['Kung pao chicken', 14.0],
      ['Dry-fried green beans', 12.0],
      ['Pork dumplings (8)', 8.0],
      ['Steamed rice', 2.0],
    ],
    peakAmp: 2.1,
    offers: {
      ubereats: { subtotal: 23.0, fees: 5.2, promo: PROMOS.SPICY20, eta: [29, 39] },
      grubhub: { subtotal: 22.1, fees: 4.95, eta: [33, 43] },
      doordash: { subtotal: 23.5, fees: 5.4, eta: [25, 35] },
    },
  },
  {
    id: 'pizza-milano',
    name: 'Pizza Milano',
    category: 'Pizza',
    cuisine: ['Pizza', 'Italian'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.3,
    ratingCount: 540,
    priceTier: 1,
    distanceMi: 0.4,
    openUntil: '2 am',
    image: 'linear-gradient(135deg, #f7d6c0, #e2956d)',
    order: [
      { name: 'Large cheese pizza', qty: 1 },
      { name: 'Garlic knots', qty: 1 },
    ],
    orderLabel: 'Large cheese + garlic knots, delivered',
    menu: [
      ['Large cheese pizza', 12.0],
      ['Large pepperoni pizza', 14.0],
      ['Garlic knots', 4.5],
      ['Buffalo wings (10)', 11.0],
      ['Caesar salad', 7.0],
      ['2-liter soda', 3.5],
    ],
    peakAmp: 1.4,
    offers: {
      grubhub: { subtotal: 13.0, fees: 3.2, eta: [19, 29] },
      doordash: { subtotal: 13.75, fees: 4.2, eta: [21, 31] },
    },
  },
  {
    id: 'prince-of-india',
    name: 'Prince of India',
    category: 'Indian',
    cuisine: ['Indian'],
    dietaryTags: ['Halal', 'Vegetarian options'],
    rating: 4.8,
    ratingCount: 990,
    priceTier: 2,
    distanceMi: 1.4,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #f8e0bf, #e6b06a)',
    order: [
      { name: 'Chicken tikka masala', qty: 1 },
      { name: 'Garlic naan', qty: 2 },
    ],
    orderLabel: 'Tikka masala + 2 naan, delivered',
    menu: [
      ['Chicken tikka masala', 15.5],
      ['Lamb biryani', 17.0],
      ['Palak paneer', 14.0],
      ['Garlic naan', 3.5],
      ['Samosas (2)', 5.0],
      ['Mango lassi', 4.5],
    ],
    peakAmp: 4.6,
    offers: {
      ubereats: { subtotal: 21.5, fees: 5.8, eta: [38, 48] },
      doordash: { subtotal: 22.4, fees: 6.7, eta: [34, 44] },
      grubhub: { subtotal: 23.1, fees: 7.35, eta: [41, 51] },
    },
  },
  {
    id: 'bangkok-balcony',
    name: 'Bangkok Balcony',
    category: 'Thai',
    cuisine: ['Thai'],
    dietaryTags: ['Vegan options', 'Gluten-free options', 'Healthy'],
    rating: 4.4,
    ratingCount: 710,
    priceTier: 2,
    distanceMi: 0.8,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #e6efd6, #b9cf8f)',
    order: [
      { name: 'Pad see ew', qty: 1 },
      { name: 'Thai iced tea', qty: 1 },
    ],
    orderLabel: 'Pad see ew + Thai iced tea, delivered',
    menu: [
      ['Pad see ew', 13.5],
      ['Pad thai', 13.0],
      ['Green curry', 14.5],
      ['Tom yum soup', 7.0],
      ['Fresh spring rolls', 6.5],
      ['Thai iced tea', 4.0],
    ],
    peakAmp: 1.6,
    offers: {
      doordash: { subtotal: 15.6, fees: 4.2, eta: [27, 37] },
      grubhub: { subtotal: 16.1, fees: 5.05, eta: [30, 40] },
      ubereats: { subtotal: 16.8, fees: 5.4, eta: [32, 42] },
    },
  },
  {
    id: 'burgatory-waterfront',
    name: 'Burgatory Waterfront',
    category: 'Burgers',
    cuisine: ['Burgers', 'American'],
    dietaryTags: [],
    rating: 4.5,
    ratingCount: 1800,
    priceTier: 2,
    distanceMi: 2.1,
    openUntil: '11 pm',
    image: 'linear-gradient(135deg, #f3d5c9, #d98f74)',
    order: [
      { name: 'Piggy burger', qty: 1 },
      { name: 'Truffle fries', qty: 1 },
    ],
    orderLabel: 'Piggy burger + truffle fries, delivered',
    menu: [
      ['Piggy burger', 11.5],
      ['Classic cheeseburger', 10.0],
      ['Impossible burger', 12.5],
      ['Truffle fries', 6.0],
      ['Onion rings', 5.5],
      ['Vanilla shake', 6.0],
    ],
    peakAmp: 2.0,
    offers: {
      doordash: { subtotal: 13.6, fees: 3.8, eta: [26, 36] },
      ubereats: { subtotal: 14.4, fees: 4.85, eta: [29, 39] },
    },
  },
  {
    id: 'sushi-fuku',
    name: 'Sushi Fuku',
    category: 'Sushi',
    cuisine: ['Sushi', 'Japanese'],
    dietaryTags: ['Gluten-free options', 'Healthy'],
    rating: 4.6,
    ratingCount: 640,
    priceTier: 2,
    distanceMi: 0.5,
    openUntil: '9 pm',
    image: 'linear-gradient(135deg, #dfe8ee, #a9bfd0)',
    order: [
      { name: 'Salmon poke bowl', qty: 1 },
      { name: 'Miso soup', qty: 1 },
    ],
    orderLabel: 'Salmon poke + miso, delivered',
    menu: [
      ['Salmon poke bowl', 14.0],
      ['Spicy tuna roll', 9.0],
      ['California roll', 8.0],
      ['Chirashi bowl', 17.0],
      ['Miso soup', 3.0],
      ['Edamame', 4.5],
    ],
    peakAmp: 1.5,
    offers: {
      ubereats: { subtotal: 17.4, fees: 4.7, eta: [21, 31] },
      doordash: { subtotal: 18.2, fees: 5.15, eta: [24, 34] },
      grubhub: { subtotal: 18.9, fees: 5.9, eta: [33, 43] },
    },
  },
  {
    id: 'salems-market-grill',
    name: "Salem's Market & Grill",
    category: 'Halal',
    cuisine: ['Halal', 'Mediterranean'],
    dietaryTags: ['Halal'],
    rating: 4.7,
    ratingCount: 1100,
    priceTier: 1,
    distanceMi: 1.9,
    openUntil: '9 pm',
    image: 'linear-gradient(135deg, #f5e2c8, #d9b47e)',
    order: [{ name: 'Chicken shawarma platter', qty: 1 }],
    orderLabel: 'Shawarma platter, delivered',
    menu: [
      ['Chicken shawarma platter', 12.5],
      ['Beef kabob platter', 14.5],
      ['Falafel wrap', 8.5],
      ['Hummus & pita', 6.0],
      ['Lentil soup', 4.5],
      ['Baklava', 3.5],
    ],
    peakAmp: 1.2,
    offers: {
      grubhub: { subtotal: 12.5, fees: 3.4, eta: [30, 40] },
      ubereats: { subtotal: 13.25, fees: 4.95, eta: [28, 38] },
    },
  },
  {
    id: 'noodlehead',
    name: 'Noodlehead',
    category: 'Thai',
    cuisine: ['Thai', 'Noodles'],
    dietaryTags: ['Vegan options'],
    rating: 4.6,
    ratingCount: 1500,
    priceTier: 1,
    distanceMi: 0.7,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #eeead6, #cfc48a)',
    order: [
      { name: 'Khao soi', qty: 1 },
      { name: 'Crispy spring rolls', qty: 1 },
    ],
    orderLabel: 'Khao soi + spring rolls, delivered',
    menu: [
      ['Khao soi', 12.0],
      ['Drunken noodles', 11.5],
      ['Crispy spring rolls', 6.0],
      ['Larb', 10.5],
      ['Coconut rice', 3.0],
      ['Thai basil fried rice', 11.0],
    ],
    peakAmp: 1.7,
    offers: {
      doordash: { subtotal: 14.2, fees: 3.95, eta: [23, 33] },
      ubereats: { subtotal: 14.6, fees: 4.4, eta: [25, 35] },
      grubhub: { subtotal: 15.1, fees: 5.2, eta: [29, 39] },
    },
  },
  {
    id: 'giant-eagle-market-district',
    name: 'Giant Eagle Market District',
    category: 'Grocery',
    cuisine: ['Grocery', 'Supermarket'],
    dietaryTags: ['Vegan options', 'Gluten-free options'],
    rating: 4.6,
    ratingCount: 3200,
    priceTier: 2,
    distanceMi: 1.6,
    openUntil: '11 pm',
    image: 'linear-gradient(135deg, #dcecdc, #9ec79a)',
    order: [
      { name: 'Milk, 1 gal', qty: 1 },
      { name: 'Eggs, dozen', qty: 1 },
      { name: 'Bananas, 1 lb', qty: 2 },
      { name: 'Bread, loaf', qty: 1 },
    ],
    orderLabel: 'Milk, eggs, bananas, bread, delivered',
    menu: [
      ['Milk, 1 gal', 4.29],
      ['Eggs, dozen', 3.99],
      ['Bananas, 1 lb', 0.69],
      ['Bread, loaf', 3.49],
      ['Chicken breast, 1 lb', 5.99],
      ['Baby spinach, 5 oz', 3.29],
      ['Pasta, 1 lb', 1.79],
      ['Orange juice, 52 oz', 4.49],
    ],
    peakAmp: 1.0,
    offers: {
      doordash: { subtotal: 21.4, fees: 5.2, eta: [40, 55] },
      ubereats: { subtotal: 23.1, fees: 6.1, eta: [45, 60] },
    },
  },
  {
    id: 'whole-foods-east-liberty',
    name: 'Whole Foods East Liberty',
    category: 'Grocery',
    cuisine: ['Grocery', 'Organic'],
    dietaryTags: ['Vegan options', 'Gluten-free options', 'Healthy'],
    rating: 4.5,
    ratingCount: 2100,
    priceTier: 3,
    distanceMi: 2.3,
    openUntil: '10 pm',
    image: 'linear-gradient(135deg, #e3ead3, #a8bf84)',
    order: [
      { name: 'Oat milk, 64 oz', qty: 1 },
      { name: 'Avocados', qty: 3 },
      { name: 'Sourdough loaf', qty: 1 },
    ],
    orderLabel: 'Oat milk, avocados, sourdough, delivered',
    menu: [
      ['Oat milk, 64 oz', 4.99],
      ['Avocados, each', 1.69],
      ['Sourdough loaf', 5.49],
      ['Organic eggs, dozen', 5.99],
      ['Salmon fillet, 1 lb', 14.99],
      ['Hummus, 10 oz', 4.29],
      ['Blueberries, pint', 4.99],
    ],
    peakAmp: 0.9,
    offers: {
      ubereats: { subtotal: 24.9, fees: 6.4, eta: [45, 60] },
    },
  },
  {
    id: 'primanti-bros-oakland',
    name: 'Primanti Bros. Oakland',
    category: 'Sandwiches',
    cuisine: ['Sandwiches', 'American'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.4,
    ratingCount: 2600,
    priceTier: 1,
    distanceMi: 0.3,
    openUntil: '3 am',
    image: 'linear-gradient(135deg, #f5dcc4, #d9a06e)',
    order: [
      { name: 'Pitts-burger & cheese', qty: 1 },
      { name: 'Cheese fries', qty: 1 },
    ],
    orderLabel: 'Pitts-burger + cheese fries, delivered',
    menu: [
      ['Pitts-burger & cheese', 11.5],
      ['Capicola & cheese', 11.0],
      ['Pastrami & cheese', 12.0],
      ['Cheese fries', 6.0],
      ['Coleslaw', 3.0],
      ['Fountain soda', 2.5],
    ],
    peakAmp: 1.9,
    offers: {
      doordash: { subtotal: 17.5, fees: 4.6, eta: [18, 28] },
      grubhub: { subtotal: 18.1, fees: 4.9, eta: [25, 35] },
      ubereats: { subtotal: 18.4, fees: 5.2, eta: [22, 32] },
    },
  },
  {
    id: 'pamelas-diner-oakland',
    name: "Pamela's Diner Oakland",
    category: 'Breakfast',
    cuisine: ['Breakfast', 'Diner'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.6,
    ratingCount: 1900,
    priceTier: 1,
    distanceMi: 0.5,
    openUntil: '3 pm',
    image: 'linear-gradient(135deg, #f9e6c7, #e6b978)',
    order: [
      { name: 'Strawberry hotcakes', qty: 1 },
      { name: 'Home fries', qty: 1 },
    ],
    orderLabel: 'Hotcakes + home fries, delivered',
    menu: [
      ['Strawberry hotcakes', 11.0],
      ['Lyonnaise potatoes & eggs', 10.5],
      ['Western omelette', 11.5],
      ['Home fries', 4.0],
      ['Bacon (3)', 4.5],
      ['Coffee', 2.5],
    ],
    peakAmp: 1.3,
    offers: {
      grubhub: { subtotal: 15.0, fees: 4.1, eta: [22, 32] },
      doordash: { subtotal: 15.9, fees: 4.7, eta: [20, 30] },
    },
  },
  {
    id: 'daves-hot-chicken',
    name: "Dave's Hot Chicken",
    category: 'Chicken',
    cuisine: ['Chicken', 'Sandwiches'],
    dietaryTags: [],
    rating: 4.5,
    ratingCount: 1300,
    priceTier: 2,
    distanceMi: 1.0,
    openUntil: '12 am',
    image: 'linear-gradient(135deg, #f7d9c4, #dd8f5e)',
    order: [
      { name: 'Hot chicken sliders (2)', qty: 1 },
      { name: 'Fries', qty: 1 },
    ],
    orderLabel: '2 sliders + fries, delivered',
    menu: [
      ['Hot chicken sliders (2)', 12.0],
      ['Chicken tenders (3)', 13.5],
      ['Slider & tender combo', 15.5],
      ['Fries', 4.0],
      ['Kale slaw', 3.5],
      ['Milkshake', 6.0],
    ],
    peakAmp: 2.6,
    offers: {
      ubereats: { subtotal: 16.0, fees: 4.9, eta: [24, 34] },
      doordash: { subtotal: 16.75, fees: 5.3, eta: [21, 31] },
      grubhub: { subtotal: 17.2, fees: 5.6, eta: [30, 40] },
    },
  },
  {
    id: 'prantls-bakery-shadyside',
    name: "Prantl's Bakery Shadyside",
    category: 'Desserts',
    cuisine: ['Desserts', 'Bakery', 'Coffee'],
    dietaryTags: ['Vegetarian options'],
    rating: 4.8,
    ratingCount: 780,
    priceTier: 2,
    distanceMi: 1.2,
    openUntil: '6 pm',
    image: 'linear-gradient(135deg, #f3dfd6, #c9987f)',
    order: [
      { name: 'Burnt almond torte slice', qty: 2 },
      { name: 'Latte', qty: 1 },
    ],
    orderLabel: '2 torte slices + latte, delivered',
    menu: [
      ['Burnt almond torte slice', 6.5],
      ['Whole burnt almond torte', 32.0],
      ['Chocolate eclair', 4.5],
      ['Thumbprint cookies (6)', 7.0],
      ['Latte', 4.75],
      ['Drip coffee', 2.75],
    ],
    peakAmp: 0.8,
    offers: {
      doordash: { subtotal: 17.75, fees: 5.0, eta: [20, 30] },
      ubereats: { subtotal: 18.5, fees: 5.35, eta: [23, 33] },
    },
  },
];

const PEAK_AMP: Record<string, number> = Object.fromEntries(SEEDS.map((s) => [s.id, s.peakAmp]));

/**
 * Per-platform menu prices. Each platform marks the same dish up by the same
 * ratio its representative-order subtotal is marked up versus the cheapest
 * listing, so the menu and the ledger tell one consistent story.
 */
function buildMenu(seed: RestaurantSeed): MenuItem[] {
  const subtotals = Object.values(seed.offers).map((o) => o.subtotal);
  const floor = Math.min(...subtotals);
  return seed.menu.map(([name, price]) => ({
    name,
    price,
    prices: Object.fromEntries(
      (Object.entries(seed.offers) as [PlatformSlug, OfferSeed][]).map(([slug, o]) => [
        slug,
        round2(price * (o.subtotal / floor)),
      ]),
    ) as Partial<Record<PlatformSlug, number>>,
  }));
}

export const RESTAURANTS: Restaurant[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  menu: buildMenu(s),
  cuisine: s.cuisine,
  dietaryTags: s.dietaryTags,
  rating: s.rating,
  ratingCount: s.ratingCount,
  priceTier: s.priceTier,
  distanceMi: s.distanceMi,
  openUntil: s.openUntil,
  location: { zip: ZIP, geo: { lat: 40.4443, lng: -79.9608 } },
  platformIds: Object.fromEntries(
    Object.keys(s.offers).map((slug) => [slug, `${slug}:${s.id}`]),
  ) as Partial<Record<PlatformSlug, string>>,
  imageUrl: photoUrl(s.id),
  image: s.image,
  order: s.order,
  orderLabel: s.orderLabel,
  tipPct: 15,
  offers: (Object.entries(s.offers) as [PlatformSlug, OfferSeed][]).map(([slug, seed]) =>
    makeOffer(s.id, slug, seed),
  ),
}));

// ---------------------------------------------------------------------------
// Price history: 7 days x 24 hours per platform, deterministic.
// ---------------------------------------------------------------------------

/** mulberry32 — tiny seeded PRNG so the chart is identical on every load. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0..1 dinner-peak curve (17-20h), with a smaller lunch bump and a late dip. */
export function hourCurve(hour: number): number {
  const dinner = Math.exp(-((hour - 18.6) ** 2) / (2 * 1.35 ** 2));
  const lunch = 0.35 * Math.exp(-((hour - 12.4) ** 2) / (2 * 0.9 ** 2));
  const late = hour >= 22 || hour <= 1 ? -0.12 : 0;
  const dead = hour >= 2 && hour < 10 ? -0.2 : 0;
  return dinner + lunch + late + dead;
}

/** Weekend multiplier on top of the hour curve. Sunday=0 ... Saturday=6. */
export function dayBump(dow: number): number {
  return [0.45, -0.1, -0.25, -0.3, 0.05, 0.7, 0.95][dow] ?? 0;
}

export const HISTORY_HOURS = 7 * 24;

export function generateHistory(restaurant: Restaurant, offer: Offer): PriceSnapshot[] {
  const rand = prng(hashString(`${restaurant.id}/${offer.platformSlug}`));
  const amp = PEAK_AMP[restaurant.id] ?? 2;

  // Smooth, mean-reverting noise so the line wobbles instead of buzzing.
  const noise: number[] = [];
  let n = 0;
  for (let i = 0; i < HISTORY_HOURS; i++) {
    n = n * 0.72 + (rand() - 0.5) * 0.6;
    noise.push(n);
  }

  const shape = (d: Date) => amp * hourCurve(d.getHours()) + amp * 0.7 * dayBump(d.getDay());
  // A promo is applied from its start time until now.
  const promoStart = offer.promo ? Date.parse(offer.promo.startsAt) : Infinity;
  const promoFor = (at: Date) => at.getTime() >= promoStart;

  // Anchor the series so the final point equals the live offer.
  const last = HISTORY_HOURS - 1;
  const base =
    offer.total -
    shape(NOW) -
    noise[last] +
    (promoFor(NOW) ? offer.promoDiscount : 0);

  const out: PriceSnapshot[] = [];
  for (let i = 0; i < HISTORY_HOURS; i++) {
    const at = i === last ? NOW : new Date(NOW.getTime() - (last - i) * 3_600_000);
    if (i !== last) at.setMinutes(0, 0, 0);
    const curve = hourCurve(at.getHours());
    const promoApplied = promoFor(at);
    const raw = base + shape(at) + noise[i] - (promoApplied ? offer.promoDiscount : 0);
    const total = i === last ? offer.total : round2(Math.max(offer.subtotal + 1, raw));
    out.push({
      restaurantId: restaurant.id,
      platformSlug: offer.platformSlug,
      total,
      deliveryFee: round2(offer.deliveryFee + Math.max(0, curve) * amp * 0.35),
      etaMin: Math.round(offer.etaMin + Math.max(0, curve) * 9),
      promoApplied,
      capturedAt: at.toISOString(),
    });
  }
  return out;
}

const historyCache = new Map<string, PriceSnapshot[]>();

export function mockHistory(restaurantId: string): PriceSnapshot[] {
  const cached = historyCache.get(restaurantId);
  if (cached) return cached;
  const r = RESTAURANTS.find((x) => x.id === restaurantId);
  if (!r) return [];
  const rows = r.offers.flatMap((o) => generateHistory(r, o));
  historyCache.set(restaurantId, rows);
  return rows;
}

// Derive `peakSurcharge` from the generated history: cheapest total right now
// versus that platform's 7-day average.
for (const r of RESTAURANTS) {
  const best = [...r.offers].sort((a, b) => a.total - b.total)[0];
  if (!best) continue;
  const rows = mockHistory(r.id).filter((s) => s.platformSlug === best.platformSlug);
  const mean = rows.reduce((sum, s) => sum + s.total, 0) / rows.length;
  r.peakSurcharge = Math.round((best.total - mean) * 10) / 10;
}
