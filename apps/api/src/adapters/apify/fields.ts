/**
 * Every field the normalizer resolves, and the key names it accepts for each.
 *
 * These live in one place so a profile (./profiles.ts) can override any single
 * field for one actor without forking the normalizer. Within a list the order is
 * a preference order: `pickField` tries the shallowest depth first, then walks
 * the list, so putting a name first makes it win when a row has several.
 */
export interface FieldAliases {
  /** Store identity */
  storeId: string[];
  name: string[];
  url: string[];
  image: string[];
  /** Location */
  address: string[];
  street: string[];
  zip: string[];
  /** Presentation */
  cuisine: string[];
  rating: string[];
  ratingText: string[];
  ratingCount: string[];
  /** ETA: a `{min,max}` object or free text under one key, else a min/max pair */
  eta: string[];
  etaMin: string[];
  etaMax: string[];
  /** Fees */
  deliveryFee: string[];
  serviceFee: string[];
  smallOrderFee: string[];
  tax: string[];
  promo: string[];
  /** Menu: containers walked into, then the item's own fields */
  menuContainers: string[];
  itemName: string[];
  /** Formatted price strings ("$17.99") — unambiguous, unlike a bare number. */
  itemPriceText: string[];
  itemPriceNum: string[];
  /** Flat datasets: the row-type discriminator and the store join key */
  recordType: string[];
  joinKey: string[];
}

export type FieldKey = keyof FieldAliases;

/**
 * The default vocabulary: the union of what the popular DoorDash / Uber Eats /
 * Grubhub actors emit. Most actors need nothing beyond this.
 */
export const DEFAULT_FIELDS: FieldAliases = {
  storeId: ['storeId', 'store_id', 'restaurantId', 'id', 'uuid', 'storeUuid', 'merchantId', 'slug'],
  name: ['name', 'title', 'storeName', 'restaurantName', 'displayName', 'merchantName'],
  url: ['url', 'storeUrl', 'link', 'webUrl', 'permalink', 'href'],
  image: ['imageUrl', 'image', 'imgUrl', 'heroImageUrl', 'headerImageUrl', 'coverImageUrl', 'photoUrl', 'thumbnail', 'logo'],

  address: ['address', 'fullAddress', 'streetAddress', 'location', 'addressLine1'],
  street: ['streetAddress', 'street', 'addressLine1', 'address1', 'formattedAddress', 'displayAddress', 'full', 'address', 'line1'],
  zip: ['zip', 'zipCode', 'postalCode', 'postcode'],

  cuisine: ['cuisines', 'cuisine', 'cuisineList', 'cuisineTypes', 'categories', 'category', 'tags', 'cuisineType', 'foodTypes', 'primaryCategory'],
  rating: ['rating', 'ratingValue', 'averageRating', 'avgRating', 'stars', 'score', 'reviewsAverage'],
  ratingText: ['ratingText', 'ratingString', 'reviewsText'],
  ratingCount: ['ratingCount', 'reviewsCount', 'numRatings', 'numberOfRatings', 'reviewCount', 'ratingsCount', 'totalRatings', 'numReviews'],

  eta: ['deliveryEtaMinutes', 'etaMinutes', 'eta', 'etaRange', 'deliveryTime', 'estimatedDeliveryTime', 'deliveryEta', 'deliveryTimeRange', 'timeEstimate', 'duration'],
  etaMin: ['etaMin', 'minDeliveryTime', 'deliveryTimeMin', 'minEta', 'estimatedDeliveryTimeMin'],
  etaMax: ['etaMax', 'maxDeliveryTime', 'deliveryTimeMax', 'maxEta', 'estimatedDeliveryTimeMax'],

  // `fareBadge` / `feeBadge` are display strings (" $0 delivery fee (new users)").
  deliveryFee: ['deliveryFee', 'delivery', 'deliveryCost', 'deliveryPrice', 'shippingFee', 'fareBadge', 'feeBadge', 'deliveryBadge', 'deliveryFeeText'],
  serviceFee: ['serviceFee', 'service', 'serviceCharge', 'platformFee'],
  smallOrderFee: ['smallOrderFee', 'smallOrder', 'minimumOrderFee', 'smallBasketFee'],
  tax: ['tax', 'taxes', 'salesTax', 'estimatedTax'],
  promo: ['promotions', 'promo', 'promotion', 'offer', 'offerText', 'deal', 'dealText', 'promoText', 'promotionText', 'banner'],

  menuContainers: [
    'items', 'menuItems', 'products', 'dishes', 'categories', 'menu', 'menus', 'sections', 'itemLists', 'catalog',
    // Uber Eats' own catalog vocabulary, which several actors pass through verbatim.
    'catalogItems', 'catalogSections', 'menuSections', 'subsections', 'subSections', 'itemCategories',
  ],
  itemName: ['name', 'title', 'itemName', 'productName', 'displayName'],
  itemPriceText: ['priceTagline', 'priceFormatted', 'formattedPrice', 'priceString', 'priceText', 'priceLabel', 'displayPrice'],
  itemPriceNum: ['price', 'itemPrice', 'currentPrice', 'basePrice', 'unitPrice', 'displayPrice'],

  recordType: ['recordType', 'record_type', 'type', 'rowType', '_type', 'objectType'],
  joinKey: ['storeId', 'store_id', 'restaurantId', 'merchantId'],
};

/**
 * Merge a profile's overrides over the defaults. An override *prepends* by
 * default, so the actor's own key names win while the generic list stays as a
 * fallback; prefix a list with `'!'` to replace the defaults outright, for when
 * a generic alias actively means the wrong thing on that actor.
 */
export function mergeFields(overrides?: Partial<Record<FieldKey, string[]>>): FieldAliases {
  if (!overrides) return DEFAULT_FIELDS;
  const out = { ...DEFAULT_FIELDS };
  for (const [key, aliases] of Object.entries(overrides) as Array<[FieldKey, string[]]>) {
    if (!aliases?.length) continue;
    out[key] = aliases[0] === '!' ? aliases.slice(1) : [...aliases, ...DEFAULT_FIELDS[key].filter((a) => !aliases.includes(a))];
  }
  return out;
}
