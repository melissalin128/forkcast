/**
 * Grubhub live scraper (verified working 2026-09, see parsers/grubhub.ts for
 * the payload shapes).
 *
 * Flow:
 *   searchRestaurants: geocode zip -> open /search?queryText=..&latitude=..&longitude=..
 *     The SPA reverse-geocodes the point (no address modal needed), sets it as the
 *     delivery location and calls /restaurants/search/search_listing; we capture that
 *     JSON. If the capture misses (slow network) we call the same endpoint from inside
 *     the page with the bearer token the page itself uses.
 *   fetchOffer: open /restaurant/r/<id> (Grubhub canonicalises the slug) and capture
 *     /restaurants/<id>?..&location=POINT(..) (live delivery fee, fee rules, tax %, ETA)
 *     and /restaurants/<id>/menu_items (prices). Fee lines are computed from Grubhub's
 *     own rules for the subtotal, exactly as its checkout does; no cart is created.
 */
import type { Page } from 'playwright';
import type { Offer } from '../models/types';
import { computeTotal } from '../pricing/computeTotal';
import { geocodeZip, type ZipLocation } from '../services/zipGeo';
import { PlaywrightScraper, ResponseCapture } from './scraperBase';
import { type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';
import {
  grubhubFeeLines,
  grubhubPromo,
  parseGrubhubMenuItems,
  parseGrubhubRestaurant,
  parseGrubhubSearch,
  pickGrubhubSubtotal,
  type GrubhubMenuItem,
  type GrubhubSearchRow,
  type GrubhubStore,
} from './parsers/grubhub';

const API = 'https://api-gtm.grubhub.com';
const CAPTURE_MS = 20000;

const point = (loc: ZipLocation) => `POINT(${loc.lng}%20${loc.lat})`;

export class GrubhubAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'grubhub' as const;
  /** Bearer token the page sends to api-gtm; captured from its own requests. */
  private token: string | null = null;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.grubhub.com/restaurant/r/${encodeURIComponent(platformRestaurantId)}`;
  }

  private watchToken(page: Page): void {
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && /api-gtm\.grubhub\.com/.test(req.url())) this.token = auth;
    });
  }

  private searchUrl(query: string, loc: ZipLocation | null): string {
    const p = new URLSearchParams({
      queryText: query,
      orderMethod: 'delivery',
      locationMode: 'DELIVERY',
      facetSet: 'umamiV6',
      pageSize: '36',
      hideHateos: 'true',
      searchMetrics: 'true',
      sortSetId: 'umamiV3',
      countOmittingTimes: 'true',
      tab: 'all',
    });
    if (loc) {
      p.set('latitude', String(loc.lat));
      p.set('longitude', String(loc.lng));
    }
    return `https://www.grubhub.com/search?${p.toString()}`;
  }

  /** Call an api-gtm endpoint from inside the page (same headers/cookies the SPA uses). */
  private async apiFetch(page: Page, url: string): Promise<string | undefined> {
    const token = this.token;
    if (!token) return undefined;
    try {
      const out = await page.evaluate(
        async ({ url, token }) => {
          const r = await fetch(url, { headers: { authorization: token, accept: 'application/json' } });
          return r.ok ? await r.text() : '';
        },
        { url, token },
      );
      return out || undefined;
    } catch (err) {
      this.debug('api fetch', err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }

  /**
   * Grubhub takes the delivery point straight from the search URL, so the
   * address modal is only a fallback (used when the zip cannot be geocoded).
   */
  async setDeliveryLocation(page: Page, zip: string): Promise<boolean> {
    if (this.addressSetForZip === zip) return true;
    try {
      const input = page.locator('input[data-testid="address-input"], input[placeholder*="address" i]').first();
      await input.click({ timeout: 8000 });
      await input.fill(zip);
      await page.waitForTimeout(2500);
      const option = page.locator('[role="option"]').first();
      if ((await option.count()) > 0) await option.click({ timeout: 5000 });
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
      this.addressSetForZip = zip;
      return true;
    } catch (err) {
      this.debug('address modal', err instanceof Error ? err.message.split('\n')[0] : String(err));
      return false;
    }
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    const loc = await geocodeZip(zip);
    const page = await this.page();
    this.watchToken(page);
    const capture = new ResponseCapture(page, [
      { key: 'listing', url: /api-gtm\.grubhub\.com\/restaurants\/search\/search_listing\?/, accept: (b) => b.includes('"results"') },
      { key: 'search', url: /api-gtm\.grubhub\.com\/restaurants\/search\?(?!.*pageSize=0)/, accept: (b) => b.includes('"results"') },
    ]);
    try {
      await this.open(page, this.searchUrl(query, loc));
      if (!loc) await this.setDeliveryLocation(page, zip);
      let body = (await capture.wait('listing', CAPTURE_MS)) ?? capture.get('search');
      if (!body && loc) {
        const q = new URLSearchParams({ orderMethod: 'delivery', locationMode: 'DELIVERY', facetSet: 'umamiV6', pageSize: '36', hideHateos: 'true', searchMetrics: 'true', queryText: query, preciseLocation: 'true', sortSetId: 'umamiV3', countOmittingTimes: 'true', tab: 'all' });
        body = await this.apiFetch(page, `${API}/restaurants/search/search_listing?${q.toString()}&location=${point(loc)}`);
      }
      let rows = body ? parseGrubhubSearch(body) : [];
      if (rows.length === 0) rows = await this.domSearchFallback(page);
      if (rows.length === 0) this.debug('search results', 'no search_listing capture and no restaurant cards in the DOM');
      return rows.map((r) => this.toListing(r, zip));
    } finally {
      capture.stop();
      await this.closePage(page);
    }
  }

  /** Last resort: read the rendered cards. Names/ids only, the API gives the rest. */
  private async domSearchFallback(page: Page): Promise<GrubhubSearchRow[]> {
    try {
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('a[data-testid="restaurant-name"], a[href*="/restaurant/"]')].map((a) => ({
          href: a.getAttribute('href') ?? '',
          name: (a.textContent ?? '').trim(),
          meta: (a.closest('[data-testid="restaurant-card"], span.restaurant-card, [data-testid="at-regular-result-item"]')?.textContent ?? '').replace(/\s+/g, ' '),
        })),
      );
      const seen = new Set<string>();
      const out: GrubhubSearchRow[] = [];
      for (const c of cards) {
        const id = c.href.match(/\/restaurant\/(?:[^/]+\/)?(\d+)/)?.[1];
        if (!id || !c.name || seen.has(id)) continue;
        seen.add(id);
        const { parseRating, parseEta, parseMoney } = await import('./parsers/common');
        const eta = parseEta(c.meta);
        const fee = c.meta.match(/(\$\s*\d+(?:\.\d{2})?|free)\s*delivery/i)?.[1];
        out.push({ id, name: c.name, urlPath: c.href.match(/\/restaurant\/([^/]+)\/\d+/)?.[1], cuisines: [], ...parseRating(c.meta), etaMin: eta?.[0], etaMax: eta?.[1], deliveryFee: parseMoney(fee ?? null), menuItems: [] });
      }
      return out;
    } catch {
      return [];
    }
  }

  private toListing(r: GrubhubSearchRow, zip: string): PlatformListing {
    return {
      platformSlug: 'grubhub',
      platformRestaurantId: r.id,
      name: r.name,
      address: r.street ?? '',
      zip: r.zip ?? zip,
      cuisine: r.cuisines.filter((c) => !/^(lunch specials|dinner|lunch|must try|late night|national picks)$/i.test(c)).slice(0, 5),
      rating: r.rating,
      ratingCount: r.ratingCount,
      imageUrl: r.imageUrl,
      url: r.urlPath ? `https://www.grubhub.com/restaurant/${r.urlPath}/${r.id}` : this.storeUrl(r.id),
      deliveryFee: r.deliveryFee,
      etaMin: r.etaMin,
      etaMax: r.etaMax,
    };
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    const id = platformRestaurantId.match(/(\d+)\s*$/)?.[1] ?? platformRestaurantId;
    const loc = await geocodeZip(zip);
    const page = await this.page();
    this.watchToken(page);
    const capture = new ResponseCapture(page, [
      { key: 'restaurant', url: new RegExp(`api-gtm\\.grubhub\\.com/restaurants/${id}\\?`), accept: (b) => b.includes('restaurant_availability') || b.includes('"restaurant"') },
      { key: 'menu', url: new RegExp(`api-gtm\\.grubhub\\.com/restaurants/${id}/menu_items`), accept: (b) => b.includes('menu_items') },
    ]);
    try {
      // Land on the search page first when this profile has never seen the zip: that is what
      // sets the delivery point the store page prices against.
      if (loc && this.addressSetForZip !== zip) {
        await this.open(page, this.searchUrl('pizza', loc));
        await page.waitForTimeout(1500);
        this.addressSetForZip = zip;
      }
      await this.open(page, this.storeUrl(id));
      if (!loc) await this.setDeliveryLocation(page, zip);

      let storeBody = await capture.wait('restaurant', CAPTURE_MS);
      let menuBody = await capture.wait('menu', 8000);
      if (!storeBody && loc) {
        storeBody = await this.apiFetch(page, `${API}/restaurants/${id}?hideChoiceCategories=true&version=4&variationId=rtpFreeItems&orderType=standard&hideUnavailableMenuItems=true&hideMenuItems=true&location=${point(loc)}`);
      }
      const store: GrubhubStore | null = storeBody ? parseGrubhubRestaurant(storeBody) : null;
      if (!store) throw new Error(`grubhub: store ${id} did not return its restaurant payload (is it delivering to ${zip}?)`);
      let items: GrubhubMenuItem[] = menuBody ? parseGrubhubMenuItems(menuBody) : [];
      if (items.length === 0) items = await this.domMenuFallback(page);
      if (items.length === 0) this.debug('menu items', `store ${id}`);

      const picked = pickGrubhubSubtotal(items, cart);
      const subtotal = picked.subtotal > 0 ? picked.subtotal : (cart[0]?.unitPrice ?? 0) * Math.max(1, cart[0]?.quantity ?? 1);
      if (subtotal <= 0) throw new Error(`grubhub: no priced menu item found for store ${id}`);
      if (store.deliveryFee === undefined) this.debug('delivery fee', `store ${id}`);
      if (store.serviceFeePct === undefined && store.serviceFeeFlat === undefined) this.debug('service fee rule', `store ${id}`);
      if (store.salesTaxPct === undefined) this.debug('sales tax', `store ${id} (using default rate)`);

      const fees = grubhubFeeLines(store, subtotal, Number(process.env.SCRAPER_TAX_RATE ?? 0.07) || 0.07);
      const promo = grubhubPromo(store, options.at ?? new Date());
      const base = { platformSlug: 'grubhub' as const, subtotal, serviceFee: fees.serviceFee, deliveryFee: fees.deliveryFee, smallOrderFee: fees.smallOrderFee, tax: fees.tax };
      const { total } = computeTotal(base, [], [], 0.15, options.at ?? new Date());
      const locationUnverified = !loc || store.deliversHere === false;
      return {
        restaurantId: id,
        platformRestaurantId: id,
        ...base,
        total,
        etaMin: store.etaMin ?? 0,
        etaMax: store.etaMax ?? store.etaMin ?? 0,
        promo,
        fetchedAt: options.at ?? new Date(),
        deepLink: page.url().includes('/restaurant/') ? page.url().split('?')[0] : this.storeUrl(id),
        ...(locationUnverified ? { locationUnverified: true } : {}),
      };
    } finally {
      capture.stop();
      await this.closePage(page);
    }
  }

  private async domMenuFallback(page: Page): Promise<GrubhubMenuItem[]> {
    try {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="restaurant-menu-item"], [data-testid="flattened-menu-item"]')].map((el, i) => ({
          id: el.getAttribute('data-menu-item-id') ?? `dom-${i}`,
          name: (el.querySelector('[data-testid="menu-item-name-container"], h5, h6')?.textContent ?? '').trim(),
          price: (el.querySelector('[data-testid="menu-item-price"], [data-testid="flattened-menu-item-price"], [data-testid="item-price"]')?.textContent ?? '').trim(),
        })),
      );
      const { parseMoney } = await import('./parsers/common');
      return rows
        .map((r) => ({ id: r.id, name: r.name, price: parseMoney(r.price) ?? 0, popular: false }))
        .filter((r) => r.name && r.price > 0);
    } catch {
      return [];
    }
  }
}
