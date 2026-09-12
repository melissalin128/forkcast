/**
 * SYNTHETIC menu generation for the open-data ingest (`npm run ingest`).
 *
 * Real per-restaurant menus are not available under an open licence, so this
 * module INVENTS them. For every Restaurant promoted from WPRDC open data we
 * generate a plausible menu deterministically from that restaurant's REAL
 * OpenStreetMap cuisine tags and REAL price tier — nothing here is observed.
 *
 * These are NOT DoorDash / Uber Eats / Grubhub menu prices. The `platformPrices`
 * are just a flat invented markup on an invented base price. Every document is
 * written with `synthetic: true` and the UI must never present them as real
 * platform prices.
 *
 * Everything derives from unit(<stable key>), so a re-run rewrites byte-identical
 * menus. Run the built-in self-check (no DB needed) with:
 *   npx tsx src/ingest/menus.ts
 */
import assert from 'node:assert';
import { MenuItemModel, RestaurantModel, type DietaryTag } from '../models';
import { unit } from '../seed/data';
import { bulkUpsert, done } from './common';

type Cat = 'Appetizers' | 'Soups' | 'Salads' | 'Mains' | 'Sides' | 'Desserts' | 'Drinks';
type Pool = Partial<Record<Cat, string[]>>;

/** Dine-in price and calories for a mid-tier ($$) item in each category. */
const BAND: Record<Cat, [price: number, kcal: number]> = {
  Appetizers: [8.5, 380],
  Soups: [6.5, 240],
  Salads: [10.5, 420],
  Mains: [16.5, 820],
  Sides: [4.75, 320],
  Desserts: [7.25, 540],
  Drinks: [3.25, 160],
};

const TIER: Record<number, number> = { 1: 0.78, 2: 1, 3: 1.45 };

/** Name prefix -> portion multiplier. Keeps names unique within a restaurant. */
const MODIFIERS: ReadonlyArray<readonly [string, number]> = [
  ['', 1],
  ['House', 1.05],
  ['Spicy', 1.05],
  ['Small', 0.72],
  ['Large', 1.35],
  ['Deluxe', 1.3],
  ['Half Order', 0.65],
  ['Double', 1.6],
  ['Combo', 1.4],
  ['Family Size', 1.9],
];

/** Added to every pool, so even a one-note menu has drinks and a couple of staples. */
const COMMON: Pool = {
  Sides: ['Side Salad', 'French Fries'],
  Desserts: ['Cheesecake Slice', 'Chocolate Chip Cookie'],
  Drinks: ['Fountain Soda', 'Iced Tea', 'Bottled Water', 'Lemonade', 'Coffee', 'Hot Tea'],
};

// Cuisine -> category -> item names. Data only: the categories a cuisine uses are
// simply the keys it sets. Prices/calories come from BAND, not from this table.
const POOLS: Record<string, Pool> = {
  pizza: {
    Appetizers: ['Garlic Knots', 'Mozzarella Sticks', 'Fried Zucchini', 'Bruschetta'],
    Mains: ['Cheese Pizza', 'Pepperoni Pizza', 'Margherita Pizza', 'Meat Lovers Pizza', 'Veggie Pizza', 'White Pizza', 'Buffalo Chicken Pizza', 'Calzone', 'Stromboli', 'Baked Ziti', 'Chicken Parm Hoagie'],
    Sides: ['Breadsticks', 'Garlic Bread', 'Buffalo Wings'],
    Desserts: ['Cannoli'],
  },
  italian: {
    Appetizers: ['Bruschetta', 'Arancini', 'Fried Calamari', 'Caprese Salad'],
    Soups: ['Minestrone', 'Pasta e Fagioli'],
    Mains: ['Spaghetti and Meatballs', 'Chicken Parmigiana', 'Fettuccine Alfredo', 'Lasagna', 'Penne alla Vodka', 'Eggplant Parmigiana', 'Linguine with Clams', 'Veal Marsala', 'Gnocchi Sorrentina', 'Shrimp Scampi'],
    Sides: ['Garlic Bread', 'Sauteed Broccolini'],
    Desserts: ['Tiramisu', 'Cannoli', 'Panna Cotta'],
  },
  chinese: {
    Appetizers: ['Pork Dumplings', 'Vegetable Spring Rolls', 'Crab Rangoon', 'Scallion Pancake', 'Steamed Pork Bao'],
    Soups: ['Hot and Sour Soup', 'Wonton Soup', 'Egg Drop Soup'],
    Mains: ["General Tso's Chicken", 'Mapo Tofu', 'Beef with Broccoli', 'Kung Pao Chicken', 'Sesame Chicken', 'Dan Dan Noodles', 'Beef Lo Mein', 'Chicken Chow Mein', 'Twice Cooked Pork', 'Salt and Pepper Shrimp', 'Cumin Lamb', 'Eggplant with Garlic Sauce'],
    Sides: ['Steamed Rice', 'Pork Fried Rice'],
    Desserts: ['Sesame Balls'],
  },
  japanese: {
    Appetizers: ['Edamame', 'Pork Gyoza', 'Agedashi Tofu', 'Seaweed Salad', 'Takoyaki'],
    Soups: ['Miso Soup'],
    Mains: ['California Roll', 'Spicy Tuna Roll', 'Salmon Nigiri Set', 'Chirashi Bowl', 'Chicken Katsu Curry', 'Chicken Teriyaki', 'Tonkotsu Ramen', 'Shoyu Ramen', 'Beef Udon', 'Salmon Poke Bowl', 'Shrimp Tempura Platter'],
    Sides: ['Steamed Rice', 'Cucumber Sunomono'],
    Desserts: ['Mochi Ice Cream'],
    Drinks: ['Green Tea'],
  },
  thai: {
    Appetizers: ['Fresh Spring Rolls', 'Chicken Satay', 'Crab Rangoon', 'Fried Tofu'],
    Soups: ['Tom Yum Shrimp Soup', 'Tom Kha Chicken Soup'],
    Salads: ['Papaya Salad', 'Chicken Larb'],
    Mains: ['Pad Thai', 'Pad See Ew', 'Drunken Noodles', 'Green Curry', 'Red Curry', 'Massaman Curry', 'Panang Curry', 'Basil Fried Rice', 'Chicken Khao Soi', 'Cashew Chicken'],
    Sides: ['Sticky Rice', 'Jasmine Rice'],
    Desserts: ['Mango Sticky Rice'],
    Drinks: ['Thai Iced Tea'],
  },
  indian: {
    Appetizers: ['Vegetable Samosa', 'Onion Bhaji', 'Paneer Pakora'],
    Soups: ['Mulligatawny Soup'],
    Mains: ['Chicken Tikka Masala', 'Butter Chicken', 'Lamb Vindaloo', 'Palak Paneer', 'Chana Masala', 'Chicken Biryani', 'Vegetable Korma', 'Rogan Josh', 'Tandoori Chicken', 'Dal Makhani', 'Aloo Gobi'],
    Sides: ['Garlic Naan', 'Basmati Rice', 'Raita'],
    Desserts: ['Gulab Jamun', 'Kheer'],
    Drinks: ['Mango Lassi'],
  },
  mexican: {
    Appetizers: ['Chips and Salsa', 'Guacamole and Chips', 'Queso Fundido', 'Street Corn'],
    Soups: ['Chicken Tortilla Soup', 'Pork Pozole'],
    Mains: ['Carne Asada Tacos', 'Al Pastor Tacos', 'Carnitas Burrito', 'Chicken Quesadilla', 'Chile Relleno', 'Enchiladas Verdes', 'Barbacoa Bowl', 'Veggie Burrito', 'Fish Tacos', 'Chicken Chimichanga'],
    Sides: ['Refried Beans', 'Mexican Rice', 'Elote'],
    Desserts: ['Churros', 'Tres Leches Cake'],
    Drinks: ['Horchata', 'Jarritos'],
  },
  american: {
    Appetizers: ['Mozzarella Sticks', 'Loaded Nachos', 'Spinach Artichoke Dip', 'Onion Rings', 'Buffalo Wings'],
    Salads: ['Caesar Salad', 'Cobb Salad'],
    Mains: ['Cheeseburger', 'Bacon Cheeseburger', 'Veggie Burger', 'Grilled Chicken Sandwich', 'Crispy Chicken Sandwich', 'BLT Sandwich', 'Club Sandwich', 'Mac and Cheese', 'Meatloaf Plate', 'Fish and Chips', 'Steak Frites', 'Chicken Tenders Basket'],
    Sides: ['Sweet Potato Fries', 'Coleslaw', 'Mashed Potatoes'],
    Desserts: ['Apple Pie', 'Brownie Sundae'],
  },
  bbq: {
    Appetizers: ['Fried Pickles', 'Smoked Wings', 'Burnt Ends'],
    Mains: ['Pulled Pork Sandwich', 'Beef Brisket Plate', 'St. Louis Ribs', 'Smoked Half Chicken', 'Brisket Sandwich', 'Smoked Sausage Plate', 'Pork Rib Tips', 'Smoked Turkey Plate'],
    Sides: ['Baked Beans', 'Mac and Cheese', 'Coleslaw', 'Cornbread', 'Collard Greens', 'Potato Salad'],
    Desserts: ['Peach Cobbler', 'Banana Pudding'],
  },
  mediterranean: {
    Appetizers: ['Hummus and Pita', 'Baba Ghanoush', 'Falafel Plate', 'Stuffed Grape Leaves', 'Spanakopita'],
    Soups: ['Avgolemono', 'Lentil Soup'],
    Salads: ['Greek Salad', 'Tabbouleh', 'Fattoush'],
    Mains: ['Chicken Shawarma Platter', 'Beef Gyro', 'Chicken Souvlaki', 'Lamb Kebab Plate', 'Moussaka', 'Falafel Wrap', 'Mixed Grill Platter', 'Chicken Kebab Wrap'],
    Sides: ['Rice Pilaf', 'Grilled Vegetables', 'Tzatziki'],
    Desserts: ['Baklava', 'Rice Pudding'],
  },
  vietnamese: {
    Appetizers: ['Fresh Summer Rolls', 'Fried Pork Egg Rolls', 'Shrimp Chips'],
    Soups: ['Pho Ga', 'Pho Tai', 'Bun Bo Hue'],
    Salads: ['Green Papaya Salad'],
    Mains: ['Grilled Pork Banh Mi', 'Tofu Banh Mi', 'Pork Bun Cha Gio', 'Lemongrass Chicken Rice Plate', 'Grilled Chicken Vermicelli Bowl', 'Com Tam Pork Chop', 'Shaking Beef'],
    Sides: ['Steamed Rice', 'Pickled Vegetables'],
    Desserts: ['Che Ba Mau'],
    Drinks: ['Vietnamese Iced Coffee'],
  },
  korean: {
    Appetizers: ['Kimchi Pancake', 'Korean Fried Wings', 'Pork Mandu', 'Japchae'],
    Soups: ['Pork Kimchi Jjigae', 'Seafood Soondubu Jjigae'],
    Mains: ['Beef Bibimbap', 'Tofu Dolsot Bibimbap', 'Beef Bulgogi Plate', 'Spicy Pork Bulgogi', 'Galbi Short Ribs', 'Korean Fried Chicken', 'Tteokbokki', 'Spicy Sausage Army Stew'],
    Sides: ['Steamed Rice', 'Kimchi', 'Pickled Radish'],
    Desserts: ['Hotteok'],
    Drinks: ['Barley Tea'],
  },
  deli: {
    Soups: ['Chicken Noodle Soup', 'Matzo Ball Soup', 'Tomato Bisque'],
    Salads: ['Chef Salad', 'Tuna Salad Plate'],
    Mains: ['Turkey Club', 'Reuben', 'Pastrami on Rye', 'Italian Hoagie', 'Roast Beef Sandwich', 'Tuna Melt', 'Egg Salad Sandwich', 'Veggie Wrap', 'Grilled Cheese', 'Chicken Caesar Wrap', 'Philly Cheesesteak'],
    Sides: ['Potato Salad', 'Macaroni Salad', 'Coleslaw', 'Kettle Chips', 'Pickle Spear'],
    Desserts: ['Black and White Cookie'],
  },
  breakfast: {
    Mains: ['Two Egg Breakfast', 'Buttermilk Pancakes', 'Belgian Waffle', 'French Toast', 'Western Omelette', 'Veggie Omelette', 'Breakfast Burrito', 'Bacon Egg and Cheese', 'Biscuits and Sausage Gravy', 'Steak and Eggs', 'Avocado Toast', 'Corned Beef Hash'],
    Sides: ['Home Fries', 'Hash Browns', 'Bacon Strips', 'Breakfast Sausage', 'Buttered Toast', 'Fruit Cup'],
    Desserts: ['Cinnamon Roll'],
    Drinks: ['Fresh Orange Juice', 'Drip Coffee'],
  },
  dessert: {
    Desserts: ['Chocolate Layer Cake', 'Carrot Cake', 'New York Cheesecake', 'Apple Pie Slice', 'Pecan Pie Slice', 'Red Velvet Cupcake', 'Fudge Brownie', 'Cannoli', 'Eclair', 'Croissant', 'Cinnamon Roll', 'Blueberry Muffin', 'Glazed Donut', 'Soft Serve Cone', 'Two-Scoop Sundae', 'Banana Split', 'Macaron Box'],
    Drinks: ['Milkshake', 'Hot Chocolate', 'Iced Latte'],
  },
  coffee: {
    Mains: ['Bagel with Cream Cheese', 'Avocado Toast', 'Ham and Swiss Croissant', 'Breakfast Sandwich', 'Turkey Pesto Panini'],
    Desserts: ['Blueberry Muffin', 'Almond Croissant', 'Coffee Cake Slice', 'Lemon Loaf'],
    Drinks: ['Drip Coffee', 'Cold Brew', 'Iced Latte', 'Cappuccino', 'Flat White', 'Americano', 'Espresso Shot', 'Mocha', 'Chai Latte', 'Matcha Latte', 'Hot Chocolate'],
  },
  seafood: {
    Appetizers: ['Shrimp Cocktail', 'Clams Casino', 'Fried Calamari', 'Oysters on the Half Shell', 'Crab Cake Starter'],
    Soups: ['New England Clam Chowder', 'Seafood Bisque'],
    Mains: ['Fish and Chips', 'Grilled Salmon Plate', 'Blackened Mahi Mahi', 'Shrimp Po Boy', 'Crab Cake Platter', 'Fried Shrimp Basket', 'Lobster Roll', 'Seafood Pasta', 'Steamed Mussels', 'Fried Fish Sandwich'],
    Sides: ['Hush Puppies', 'Coleslaw', 'Grilled Asparagus'],
    Desserts: ['Key Lime Pie'],
  },
  wings: {
    Appetizers: ['Fried Pickles', 'Cheese Curds', 'Loaded Potato Skins'],
    Mains: ['Buffalo Wings', 'BBQ Wings', 'Honey Garlic Wings', 'Lemon Pepper Wings', 'Boneless Wings', 'Nashville Hot Wings', 'Garlic Parmesan Wings', 'Wing Combo Platter', 'Chicken Tenders'],
    Sides: ['Celery and Blue Cheese', 'Curly Fries', 'Waffle Fries', 'Onion Rings'],
  },
  salad: {
    Soups: ['Tomato Basil Soup', 'Lentil Soup'],
    Salads: ['Caesar Salad', 'Greek Salad', 'Cobb Salad', 'Southwest Chicken Salad', 'Kale Caesar', 'Quinoa Power Bowl', 'Harvest Salad', 'Chopped Italian Salad', 'Buffalo Chicken Salad', 'Beet and Goat Cheese Salad'],
    Mains: ['Grain Bowl', 'Grilled Chicken Wrap', 'Falafel Bowl', 'Turkey Avocado Wrap'],
    Sides: ['Baguette Slice', 'Fruit Cup'],
    Drinks: ['Kombucha', 'Cold Pressed Juice'],
  },
  vegan: {
    Appetizers: ['Hummus Plate', 'Crispy Cauliflower Bites', 'Vegan Nachos'],
    Soups: ['Lentil Soup', 'Butternut Squash Soup'],
    Salads: ['Kale and Quinoa Salad', 'Rainbow Slaw'],
    Mains: ['Impossible Burger', 'Tofu Banh Mi', 'Jackfruit Tacos', 'Chickpea Curry Bowl', 'Vegan Buddha Bowl', 'Seitan Gyro', 'Mushroom Stroganoff', 'Tempeh Reuben', 'Cauliflower Steak'],
    Sides: ['Roasted Brussels Sprouts', 'Garlic Green Beans', 'Sweet Potato Fries'],
    Desserts: ['Vegan Chocolate Cake', 'Coconut Ice Cream'],
    Drinks: ['Oat Milk Latte', 'Green Smoothie'],
  },
};

/** OSM cuisine values (and WPRDC category words) that map onto a pool above. */
const ALIAS: Record<string, string> = {
  sushi: 'japanese', ramen: 'japanese', noodle: 'chinese', noodles: 'chinese', asian: 'chinese',
  taiwanese: 'chinese', dumpling: 'chinese', szechuan: 'chinese', sichuan: 'chinese',
  burger: 'american', burgers: 'american', diner: 'american', steak_house: 'american',
  steakhouse: 'american', bar: 'american', pub: 'american', grill: 'american', chicken: 'wings',
  chicken_wings: 'wings', sandwich: 'deli', sandwiches: 'deli', bagel: 'deli', sub: 'deli',
  greek: 'mediterranean', kebab: 'mediterranean', turkish: 'mediterranean', lebanese: 'mediterranean',
  middle_eastern: 'mediterranean', halal: 'mediterranean', falafel: 'mediterranean',
  coffee_shop: 'coffee', cafe: 'coffee', tea: 'coffee', bubble_tea: 'coffee',
  bakery: 'dessert', ice_cream: 'dessert', donut: 'dessert', donuts: 'dessert', dessert: 'dessert', frozen_yogurt: 'dessert',
  pasta: 'italian', tex_mex: 'mexican', latin: 'mexican', fish: 'seafood', vegetarian: 'vegan',
  brunch: 'breakfast', pancake: 'breakfast', waffle: 'breakfast',
};

const LABEL: Record<string, string> = { bbq: 'BBQ', deli: 'deli-style', vegan: 'plant-based', coffee: 'cafe' };

const BLURBS = [
  '{n}, made fresh to order.',
  'A {q} {c} staple: {n}.',
  '{n} — house recipe, generously portioned.',
  'Our {q} take on {n}.',
  '{n}, one of the regulars on this menu.',
];

// Keyword rules so tags stay consistent with the dish: a steak never comes out vegan.
const VEG = /veggie|vegan|vegetable|tofu|falafel|impossible|beyond|seitan|tempeh|jackfruit|chickpea|paneer|mushroom|garden|plant/i;
const MEAT = /chicken|beef|steak|pork|bacon|ham|lamb|turkey|sausage|pepperoni|meat|burger|shrimp|fish|salmon|tuna|crab|clam|oyster|mussel|lobster|scallop|squid|calamari|anchov|duck|brisket|rib|wing|gyro|souvlaki|kebab|shawarma|carnitas|barbacoa|asada|pastor|katsu|bulgogi|galbi|mandu|gyoza|wonton|bao|pho|reuben|pastrami|cheesesteak|hoagie|club|blt|po boy|seafood|mahi|chowder|jjigae|larb|veal|moussaka|takoyaki/i;
const DAIRY_EGG = /cheese|cream|butter|milk|yogurt|egg|custard|gelato|paneer|ranch|mayo|honey|alfredo|tzatziki|feta|mozzarella|parmesan|parm|queso|chocolate|cake|brownie|cookie|pastry|waffle|pancake|croissant|latte|cappuccino|mocha|pizza|calzone|stromboli|lassi|kheer|pudding|muffin|scone|donut|eclair|tiramisu|cannoli/i;
const GLUTEN = /bread|breadstick|bun|noodle|pasta|pizza|dumpling|wrap|roll|cake|pie|waffle|pancake|sandwich|toast|donut|biscuit|tortilla|beer|crust|pita|naan|baguette|cookie|brownie|ramen|udon|spaghetti|lasagna|linguine|penne|ziti|gnocchi|calzone|stromboli|burrito|quesadilla|chimichanga|taco|nachos|croissant|bagel|pretzel|panini|hoagie|sub|banh mi|pho|katsu|tempura|teriyaki|gyoza|mandu|bao|wonton|lo mein|chow mein|empanada|cannoli|tiramisu|baklava|churro|samosa|bhaji|pakora|eclair|muffin|club|reuben|melt|gyro|souvlaki|hush puppies|cornbread|matzo|knots|stick/i;
const PORK_OR_BOOZE = /pork|bacon|ham|sausage|pepperoni|chorizo|prosciutto|carnitas|beer|vodka|marsala|wine/i;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** bulkUpsert() takes a loosely typed model; a concrete Model<T> needs the cast. */
const loose = (m: unknown): Parameters<typeof bulkUpsert>[0] => m as Parameters<typeof bulkUpsert>[0];

export interface GeneratedItem {
  name: string;
  description: string;
  category: Cat;
  cuisine: string;
  basePrice: number;
  platformPrices: { doordash: number; ubereats: number; grubhub: number };
  dietaryTags: DietaryTag[];
  calories: number;
  popularity: number;
  available: boolean;
}

/** First cuisine tag with a pool; falls back to the generic American menu. */
function poolFor(cuisines: string[]): { key: string; pool: Pool } {
  for (const raw of cuisines) {
    for (const token of [raw, ...raw.split(/[^A-Za-z]+/)]) {
      const k = token.toLowerCase().replace(/[^a-z]+/g, '_');
      const key = POOLS[k] ? k : ALIAS[k];
      if (key && POOLS[key]) return { key, pool: POOLS[key] };
    }
  }
  return { key: 'american', pool: POOLS.american };
}

function tagsFor(name: string, cat: Cat, halal: boolean): DietaryTag[] {
  const tags: DietaryTag[] = [];
  const veg = VEG.test(name) || !MEAT.test(name);
  if (veg) {
    tags.push('vegetarian');
    // Only claim vegan when the dish says so or the category makes it safe.
    if (!DAIRY_EGG.test(name) && (VEG.test(name) || cat === 'Salads' || cat === 'Sides' || cat === 'Drinks')) {
      tags.push('vegan');
    }
  }
  if (!GLUTEN.test(name)) tags.push('gluten-free');
  if (halal && !PORK_OR_BOOZE.test(name)) tags.push('halal');
  return tags;
}

/**
 * The whole generator, kept pure so the self-check at the bottom can run it
 * without a database. `slug` is the only entropy source: same slug, same menu.
 */
export function buildMenu(
  slug: string,
  cuisines: string[],
  priceTier: number,
  halal: boolean,
  count: number,
): GeneratedItem[] {
  const { key, pool } = poolFor(cuisines);
  const label = LABEL[key] ?? key[0].toUpperCase() + key.slice(1);

  const flat: Array<[Cat, string]> = [];
  for (const [cat, names] of Object.entries({ ...COMMON }) as Array<[Cat, string[]]>) {
    for (const n of names) flat.push([cat, n]);
  }
  for (const [cat, names] of Object.entries(pool) as Array<[Cat, string[]]>) {
    for (const n of names) flat.push([cat, n]);
  }

  // Platform markup varies per restaurant; DoorDash/Uber Eats mark menus up more
  // than Grubhub. Invented, but in the ballpark people report (~0-20%).
  const markup = {
    doordash: 1.08 + unit(`mk:dd:${slug}`) * 0.12,
    ubereats: 1.07 + unit(`mk:ue:${slug}`) * 0.13,
    grubhub: 1.0 + unit(`mk:gh:${slug}`) * 0.08,
  };

  const out: GeneratedItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && i < count * 25; i += 1) {
    const k = `${slug}:${i}`;
    const [cat, base] = flat[Math.floor(unit(k) * flat.length)];
    const [mod, mult] = MODIFIERS[Math.floor(unit(`m:${k}`) * MODIFIERS.length)];
    const name = mod ? `${mod} ${base}` : base;
    if (seen.has(name)) continue;
    seen.add(name);

    const [p0, kcal0] = BAND[cat];
    const basePrice = round2(p0 * TIER[priceTier] * mult * (0.8 + unit(`p:${k}`) * 0.5));
    const blurb = BLURBS[Math.floor(unit(`b:${k}`) * BLURBS.length)];
    out.push({
      name,
      description: blurb
        .replace('{n}', name)
        .replace('{q}', label)
        .replace('{c}', cat.toLowerCase().replace(/s$/, '')),
      category: cat,
      cuisine: key,
      basePrice,
      platformPrices: {
        doordash: round2(basePrice * markup.doordash),
        ubereats: round2(basePrice * markup.ubereats),
        grubhub: round2(basePrice * markup.grubhub),
      },
      dietaryTags: tagsFor(name, cat, halal),
      calories: Math.round((kcal0 * mult * (0.75 + unit(`c:${k}`) * 0.6)) / 10) * 10,
      popularity: +unit(`pop:${k}`).toFixed(3),
      available: unit(`av:${k}`) > 0.06,
    });
  }
  return out;
}

/**
 * Generate a synthetic menu for every open-data restaurant and point each
 * restaurant's sampleItem at its most popular generated dish, so the pricing
 * engine has something to price. Idempotent: upserts on (restaurantId, name).
 */
export async function generateMenus(opts: { perRestaurant?: number }): Promise<{ items: number }> {
  const per = opts.perRestaurant ?? 60;
  const cursor = RestaurantModel.find({ source: 'wprdc' })
    .select('slug cuisine priceTier dietaryTags facilityId')
    .lean()
    .cursor();

  let items = 0;
  let restaurants = 0;
  let itemOps: Record<string, unknown>[] = [];
  let restOps: Record<string, unknown>[] = [];

  const flush = async (): Promise<void> => {
    if (itemOps.length > 0) items += await bulkUpsert(loose(MenuItemModel), itemOps, 'menus');
    if (restOps.length > 0) await bulkUpsert(loose(RestaurantModel), restOps, 'menus:sample');
    itemOps = [];
    restOps = [];
  };

  for await (const r of cursor) {
    const menu = buildMenu(r.slug, r.cuisine ?? [], r.priceTier, (r.dietaryTags ?? []).includes('halal'), per);
    if (menu.length === 0) continue;
    restaurants += 1;

    for (const it of menu) {
      itemOps.push({
        updateOne: {
          filter: { restaurantId: r._id, name: it.name },
          update: { $set: { ...it, restaurantId: r._id, facilityId: r.facilityId, synthetic: true } },
          upsert: true,
        },
      });
    }

    const top = menu.reduce((a, b) => (b.popularity > a.popularity ? b : a));
    restOps.push({
      updateOne: {
        filter: { _id: r._id },
        update: {
          $set: { sampleItem: { name: top.name, menuPrice: top.basePrice } },
          $addToSet: { derivedFields: 'sampleItem' },
        },
      },
    });

    if (itemOps.length >= 2000) await flush();
  }
  await flush();

  done('menus', `${items.toLocaleString()} synthetic items across ${restaurants.toLocaleString()} restaurants`);
  return { items };
}

// Self-check (no DB): npx tsx src/ingest/menus.ts
if (require.main === module) {
  const a = buildMenu('demo-pizza-shop', ['pizza'], 2, false, 60);
  const b = buildMenu('demo-pizza-shop', ['pizza'], 2, false, 60);
  assert.deepStrictEqual(a, b, 'generation must be deterministic');
  assert.strictEqual(a.length, 60, 'should hit the requested item count');
  assert.strictEqual(new Set(a.map((i) => i.name)).size, a.length, 'names must be unique per restaurant');
  const steak = buildMenu('demo-bbq', ['bbq'], 3, false, 60).filter((i) => MEAT.test(i.name) && !VEG.test(i.name));
  assert.ok(steak.length > 0 && steak.every((i) => !i.dietaryTags.includes('vegan')), 'no vegan meat');
  assert.ok(a.every((i) => i.platformPrices.doordash >= i.basePrice), 'platform prices mark up the menu price');
  console.log(`self-check ok — e.g. ${a[0].name} $${a[0].basePrice} (dd $${a[0].platformPrices.doordash})`);
}
