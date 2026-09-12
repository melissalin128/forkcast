/**
 * Apify-backed adapter — the same PlatformAdapter contract as the Playwright
 * scrapers, except the crawling, proxying and anti-bot handling happen on
 * Apify's infrastructure and we only consume the dataset.
 *
 *   searchRestaurants -> run the platform's search actor once per (zip, query)
 *   fetchOffer        -> reuse the row the search already returned when it
 *                        carried a menu; otherwise run the store actor for that
 *                        one store
 *
 * Why the cache matters: a scrape job calls fetchOffer once per matched
 * restaurant per platform. Without reuse that is one billed actor run per
 * restaurant. Most delivery actors already return menus and fee lines on the
 * search rows, so in practice one run per platform prices the whole page.
 *
 * Fees the actor does not report stay 0 rather than being invented — the same
 * rule the live scrapers follow, since service fee and tax are checkout-only on
 * every platform.
 */
import type { Offer, PlatformSlug } from '../models/types';
import { config } from '../config';
import { computeTotal } from '../pricing/computeTotal';
import { geocodeZip } from '../services/zipGeo';
import { nameMatches, parsePromoText, type JsonObject } from './parsers/common';
import { debugOnce, round2 } from './scraperBase';
import { actorConfig, renderInput, type ActorConfig } from './apify/actors';
import { ApifyClient, ApifyError } from './apify/client';
import type { FieldAliases } from './apify/fields';
import { normalizeFees, normalizeListing, normalizeMenu, unwrapRows, type ApifyFees, type ApifyMenuItem } from './apify/normalize';
import { fieldsFor, profileFor, type ApifyProfile, type ProfileContext } from './apify/profiles';
import type { Cart, FetchOfferOptions, PlatformAdapter, PlatformListing } from './types';

export { ApifyClient, ApifyError } from './apify/client';
export { actorConfig, configuredPlatforms } from './apify/actors';
export { profileFor, PROFILES, GENERIC_PROFILE, type ApifyProfile } from './apify/profiles';
export { DEFAULT_FIELDS, type FieldAliases } from './apify/fields';

const STORE_URL: Record<PlatformSlug, (id: string) => string> = {
  doordash: (id) => `https://www.doordash.com/store/${encodeURIComponent(id)}/`,
  ubereats: (id) => `https://www.ubereats.com/store/${encodeURIComponent(id)}`,
  grubhub: (id) => `https://www.grubhub.com/restaurant/${encodeURIComponent(id)}`,
};

interface CachedStore {
  row: JsonObject;
  zip: string;
  /** The store link the actor itself returned — canonical, unlike one built from an id. */
  url?: string;
}

export class ApifyAdapter implements PlatformAdapter {
  /** Rows from the last search, so fetchOffer can price without a second run. */
  private readonly cache = new Map<string, CachedStore>();
  private clientRef?: ApifyClient;
  private actorsRef?: ActorConfig;

  private profileRef?: ApifyProfile;
  private fieldsRef?: FieldAliases;

  constructor(
    readonly platformSlug: PlatformSlug,
    client?: ApifyClient,
    actors?: ActorConfig,
    profile?: ApifyProfile,
  ) {
    this.clientRef = client;
    this.actorsRef = actors;
    this.profileRef = profile;
  }

  /** Parsing profile for the configured actor (src/adapters/apify/profiles.ts). */
  private get profile(): ApifyProfile {
    this.profileRef ??= profileFor(this.platformSlug, this.actors.searchActor);
    return this.profileRef;
  }

  private get fields(): FieldAliases {
    this.fieldsRef ??= fieldsFor(this.profile);
    return this.fieldsRef;
  }

  private ctx(zip: string): ProfileContext {
    return { platform: this.platformSlug, zip, fields: this.fields };
  }

  /** Dataset -> rows, through the profile's reshaping hook when it has one. */
  private rows(raw: unknown[]): ReturnType<typeof unwrapRows> {
    const rows = unwrapRows(raw, this.fields);
    return this.profile.rows ? this.profile.rows(rows) : rows;
  }

  /**
   * Token and actor id are resolved on first use, not in the constructor, so
   * createAdapters('apify') still works when only some platforms are configured
   * — the unconfigured ones fail in runScrapeJob's per-platform try/catch
   * instead of taking the whole process down.
   */
  private get client(): ApifyClient {
    this.clientRef ??= new ApifyClient({
      token: config.apify.token,
      timeoutSec: config.apify.timeoutSec,
      async: config.apify.async,
      ...(config.apify.memoryMbytes ? { memoryMbytes: config.apify.memoryMbytes } : {}),
      log: (line) => console.error(line),
    });
    return this.clientRef;
  }

  private get actors(): ActorConfig {
    this.actorsRef ??= actorConfig(this.platformSlug);
    return this.actorsRef;
  }

  storeUrl(platformRestaurantId: string): string {
    return STORE_URL[this.platformSlug](platformRestaurantId);
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    const limit = config.apify.maxItems;
    const input = renderInput(this.actors.searchInput, {
      query,
      zip,
      limit,
      ...(await locationFor(zip)),
    });
    // `limit` goes into the input as {{limit}} (stores wanted); the API-level
    // cap is opt-in, since it counts rows and would cut flat menus short.
    const rows = this.rows(
      await this.client.run(this.actors.searchActor, input, config.apify.hardMaxItems ? { maxItems: config.apify.hardMaxItems } : {}),
    );
    if (rows.length === 0) {
      debugOnce(this.platformSlug, 'apify search', `${this.actors.searchActor} returned an empty dataset`);
      return [];
    }

    const listings: PlatformListing[] = [];
    for (const row of rows) {
      const listing = this.toListing(row, zip);
      if (!listing) continue;
      this.cache.set(listing.platformRestaurantId, { row, zip, ...(listing.url ? { url: listing.url } : {}) });
      listings.push(listing);
    }
    if (listings.length === 0) {
      // Rows came back but none looked like a store: almost always a field-name
      // mismatch, so show one so the actor/template can be corrected.
      throw new ApifyError(
        `${this.platformSlug}: ${this.actors.searchActor} returned ${rows.length} rows but none had a store name + id. ` +
          `First row keys: ${Object.keys(rows[0]).slice(0, 12).join(', ')}`,
        502,
        this.actors.searchActor,
      );
    }
    return listings;
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    const at = options.at ?? new Date();
    const row = await this.storeRow(platformRestaurantId, zip, cart);
    const menu = this.toMenu(row, zip);
    const fees = this.toFees(row, zip);

    const picked = pickSubtotal(menu, cart);
    let subtotal = picked.subtotal;
    if (subtotal <= 0) subtotal = round2((cart[0]?.unitPrice ?? 0) * Math.max(1, cart[0]?.quantity ?? 1));
    if (subtotal <= 0) {
      throw new ApifyError(
        `${this.platformSlug}: no priced menu item for store ${platformRestaurantId} in the actor output ` +
          `(set APIFY_${this.platformSlug.toUpperCase()}_STORE_ACTOR to an actor that returns menus)`,
        502,
      );
    }
    if (fees.deliveryFee === undefined) debugOnce(this.platformSlug, 'apify delivery fee', platformRestaurantId);
    if (fees.serviceFee === undefined) debugOnce(this.platformSlug, 'apify service fee', 'actor did not report it');

    const base = {
      platformSlug: this.platformSlug,
      subtotal,
      serviceFee: fees.serviceFee ?? 0,
      deliveryFee: fees.deliveryFee ?? 0,
      smallOrderFee: fees.smallOrderFee ?? 0,
      tax: fees.tax ?? 0,
    };
    const { total } = computeTotal(base, [], [], config.defaultTipPct, at);
    const rep = picked.matched[0] ?? picked.representative;
    const promo = parsePromoText(fees.promoText, undefined, at);
    return {
      restaurantId: platformRestaurantId,
      platformRestaurantId,
      ...base,
      total,
      etaMin: fees.etaMin ?? 0,
      etaMax: fees.etaMax ?? fees.etaMin ?? 0,
      ...(promo ? { promo } : {}),
      fetchedAt: at,
      deepLink: this.deepLink(platformRestaurantId),
      ...(rep ? { representativeItem: { name: rep.name, price: rep.price } } : {}),
      // Either the actor cannot target a delivery address at all (profile flag),
      // or it reported no fee — both mean these numbers may be for another location.
      ...(this.profile.locationUnverified || fees.deliveryFee === undefined ? { locationUnverified: true } : {}),
    };
  }

  /** Cached search row when it already carries a menu, else one store-actor run. */
  private async storeRow(storeId: string, zip: string, cart: Cart): Promise<JsonObject> {
    const cached = this.cache.get(storeId);
    if (cached && cached.zip === zip && this.toMenu(cached.row, zip).length > 0) return cached.row;

    const input = renderInput(this.actors.storeInput, {
      storeId,
      storeUrl: this.deepLink(storeId),
      zip,
      ...(await locationFor(zip)),
      ...(cart[0]?.name ? { item: cart[0].name } : {}),
    });
    // maxItems stays unset: a flat dataset returns the store row plus one row
    // per menu item, and capping it at 1 would drop the whole menu.
    const rows = this.rows(await this.client.run(this.actors.storeActor, input));
    const row = rows[0];
    if (!row) {
      if (cached) return cached.row; // fall back to whatever the search gave us
      throw new ApifyError(`${this.platformSlug}: ${this.actors.storeActor} returned nothing for store ${storeId}`, 502, this.actors.storeActor);
    }
    this.cache.set(storeId, { row, zip, ...(cached?.url ? { url: cached.url } : {}) });
    return row;
  }

  /** Profile hook first, generic normalizer second — the hook may decline by returning undefined. */
  private toListing(row: JsonObject, zip: string): PlatformListing | null {
    const custom = this.profile.listing?.(row, this.ctx(zip));
    return custom !== undefined ? custom : normalizeListing(row, this.platformSlug, zip, this.fields);
  }

  private toMenu(row: JsonObject, zip: string): ApifyMenuItem[] {
    return this.profile.menu?.(row, this.ctx(zip)) ?? normalizeMenu(row, this.fields);
  }

  private toFees(row: JsonObject, zip: string): ApifyFees {
    return this.profile.fees?.(row, this.ctx(zip)) ?? normalizeFees(row, this.fields);
  }

  /**
   * Prefer the link the actor returned: ids and URLs are not interchangeable on
   * every platform (an Uber Eats row carries a UUID `storeId` while its page
   * lives at a different encoded id), so a URL rebuilt from the id can 404.
   */
  private deepLink(storeId: string): string {
    return this.cache.get(storeId)?.url ?? this.storeUrl(storeId);
  }

  async close(): Promise<void> {
    this.cache.clear();
  }
}

/** Cart lines matched against the menu; falls back to a median-priced item. */
export function pickSubtotal(
  items: ApifyMenuItem[],
  cart: Cart,
): { subtotal: number; matched: ApifyMenuItem[]; representative?: ApifyMenuItem } {
  const matched: ApifyMenuItem[] = [];
  let subtotal = 0;
  for (const line of cart) {
    const hit = items.find((i) => nameMatches(i.name, line.name));
    if (hit) {
      matched.push(hit);
      subtotal += hit.price * Math.max(1, line.quantity);
    }
  }
  if (matched.length) return { subtotal: round2(subtotal), matched };
  const representative = [...items].sort((a, b) => a.price - b.price)[Math.floor(items.length / 2)];
  return { subtotal: representative ? representative.price : 0, matched, representative };
}

/**
 * The zip as both an address string and a coordinate pair: actors take one or
 * the other, and the ones that accept coordinates resolve the delivery point
 * more precisely than "Pittsburgh, PA 15213" does.
 */
async function locationFor(zip: string): Promise<{ address: string; lat?: number; lng?: number }> {
  const loc = await geocodeZip(zip);
  return { address: loc?.label ?? zip, ...(loc ? { lat: loc.lat, lng: loc.lng } : {}) };
}
