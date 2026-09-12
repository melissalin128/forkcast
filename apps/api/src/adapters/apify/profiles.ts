/**
 * Per-actor parsing profiles.
 *
 * The important thing about the Apify path is that output shape follows the
 * *actor*, not the platform: swap the DoorDash actor and the field names change
 * again, while two platforms scraped by the same author usually look alike. So a
 * profile is registered under an actor id, not under "doordash".
 *
 * A profile is only ever an exception list. The generic normalizer already reads
 * most actors, so start with nothing, run the actor once, and add only what came
 * out wrong:
 *
 *   1. a field resolved to nothing or to the wrong key  -> `fields`
 *   2. the dataset needs reshaping before anything else -> `rows`
 *   3. a value needs real logic, not an alias           -> `listing` / `menu` / `fees`
 *
 * Registering one:
 *
 *   export const MY_ACTOR: ApifyProfile = {
 *     name: 'someone/doordash-scraper',
 *     fields: {
 *       storeId: ['!', 'storeUuid'],           // '!' replaces the defaults instead of prepending
 *       deliveryFee: ['deliveryFeeString'],    // tried before the generic names
 *     },
 *     menu: (row) => row.menus?.flatMap(...) ?? [],
 *   };
 *
 * then add it to PROFILES below. Selection order per platform:
 *   APIFY_<PLATFORM>_PROFILE  ->  a profile whose name matches the actor id  ->  generic
 */
import type { PlatformSlug } from '../../models/types';
import type { JsonObject } from '../parsers/common';
import type { PlatformListing } from '../types';
import { mergeFields, type FieldAliases, type FieldKey } from './fields';
import type { ApifyFees, ApifyMenuItem } from './normalize';

export interface ProfileContext {
  platform: PlatformSlug;
  zip: string;
  fields: FieldAliases;
}

export interface ApifyProfile {
  /** Actor id it belongs to (`username/actor-name`), or a nickname for APIFY_<PLATFORM>_PROFILE. */
  name: string;
  /** Key names to try ahead of (or instead of) the defaults. */
  fields?: Partial<Record<FieldKey, string[]>>;
  /**
   * Set when the actor has no delivery-address input, so its fees are for
   * whatever location it defaults to rather than the requested zip. Every offer
   * it produces is marked `locationUnverified` (a `?` after the price in the
   * CLI table), the same signal the Playwright scrapers raise when the address
   * modal cannot be completed.
   */
  locationUnverified?: boolean;
  /** Reshape the raw dataset before any row is read (wrappers, flat rows, filtering). */
  rows?: (raw: JsonObject[]) => JsonObject[];
  /** Replace listing/menu/fee reading outright. Return undefined to fall through to the generic path. */
  listing?: (row: JsonObject, ctx: ProfileContext) => PlatformListing | null | undefined;
  menu?: (row: JsonObject, ctx: ProfileContext) => ApifyMenuItem[] | undefined;
  fees?: (row: JsonObject, ctx: ProfileContext) => ApifyFees | undefined;
}

/** The default: aliases only, no hooks. */
export const GENERIC_PROFILE: ApifyProfile = { name: 'generic' };

/**
 * borderline/uber-eats-scraper-ppr — the Uber Eats actor this project uses.
 *
 * Its vocabulary is Uber's own: `title` for the store, `slug` as the only stable
 * id (there is no store URL in the output), sections under `menu[].catalogItems[]`,
 * prices in cents beside a `priceTagline`, `rating` as an object and the delivery
 * fee as the `fareBadge` string. The generic normalizer handles all of that; what
 * this profile adds is precision about *which* key is the id, so a future build
 * that starts emitting some other `uuid` cannot quietly change restaurant
 * identity — and keeping `title` ahead of `name`, since its menu items use `name`.
 */
export const BORDERLINE_UBEREATS: ApifyProfile = {
  name: 'borderline/uber-eats-scraper-ppr',
  fields: {
    storeId: ['!', 'slug', 'storeUuid', 'uuid'],
    name: ['title', 'sanitizedTitle'],
    cuisine: ['cuisineList'],
    promo: ['!', 'promotions'],
  },
};

/**
 * dz_omar/doordash-scraper — the DoorDash actor this project uses.
 *
 * One row per store (`record_type: "store"`), searched through a
 * /search/store/<q>/ URL plus a real delivery `address` input, so its results
 * and fees are for the requested zip. Menu comes nested on the row:
 * `menu_categories[].items[]` and a `featured_items.items[]` carousel (the
 * store's own dishes — every id also appears in the categories).
 *
 * Items carry both `price_cents` and `price_display`, and they disagree on
 * purpose: `price_cents` is the list price while `price_display` has the
 * store's discount applied ("25% off" → $11.47 vs 1529). The display string is
 * what a customer pays, so it is pinned first; the generic text-before-number
 * rule then keeps the cents value as scale evidence only.
 *
 * No hooks — aliases cover it. Everything else (name, url, address, `tags` as
 * cuisines, rating, `num_ratings`) already matches the generic vocabulary.
 */
export const DZ_OMAR_DOORDASH: ApifyProfile = {
  name: 'dz_omar/doordash-scraper',
  fields: {
    // Pinned so `business.id` (the chain) can never become the store identity.
    storeId: ['!', 'store_id'],
    image: ['header_image', 'cover_image'],
    // `asap_minutes: 30` is a bare number; as etaMin it gets the usual +10 max.
    etaMin: ['asap_minutes'],
    // "$0 delivery fee, first order" — the display string is the only fee field.
    deliveryFee: ['!', 'delivery_fee_display'],
    menuContainers: ['menu_categories', 'featured_items'],
    itemPriceText: ['price_display'],
  },
};

export const PROFILES: ApifyProfile[] = [BORDERLINE_UBEREATS, DZ_OMAR_DOORDASH];

/**
 * Resolve the profile for a platform: an explicit APIFY_<PLATFORM>_PROFILE name,
 * else whichever profile is registered for the configured actor id, else generic.
 */
export function profileFor(platform: PlatformSlug, actorId: string, env: NodeJS.ProcessEnv = process.env): ApifyProfile {
  const wanted = env[`APIFY_${platform.toUpperCase()}_PROFILE`]?.trim();
  if (wanted) {
    const found = byName(wanted);
    if (!found) {
      throw new Error(
        `${platform}: APIFY_${platform.toUpperCase()}_PROFILE="${wanted}" is not a registered profile ` +
          `(have: ${['generic', ...PROFILES.map((p) => p.name)].join(', ')}). Add it in src/adapters/apify/profiles.ts.`,
      );
    }
    return found;
  }
  return byName(actorId) ?? GENERIC_PROFILE;
}

const byName = (name: string): ApifyProfile | undefined =>
  name === 'generic' ? GENERIC_PROFILE : PROFILES.find((p) => p.name.toLowerCase() === name.toLowerCase());

/** The profile's field vocabulary, defaults merged in. */
export const fieldsFor = (profile: ApifyProfile): FieldAliases => mergeFields(profile.fields);
