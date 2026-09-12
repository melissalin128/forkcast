/**
 * Uber Eats live scraper.
 *
 * Location: Uber keeps the delivery address in the `uev2.loc` cookie (JSON with
 * lat/lng + address). We set that cookie from the geocoded zip, which is more
 * reliable than the typeahead; the typeahead is the fallback.
 *
 * Search:  /search?q=<query>&diningMode=DELIVERY -> SSR `__REACT_QUERY_STATE__` (see
 *          parsers/ubereats.ts) or the page's own /_p/api/getSearchFeedV1 JSON, then DOM.
 * Store:   /store/<slug>/<id> -> same state (store payload with catalogSectionsMap prices,
 *          fare badge "$x.xx Delivery Fee", ETA range, promotion) or /_p/api/getStoreV1.
 * Fees:    Uber only itemises service fee / taxes on the checkout page, which requires a
 *          signed-in account. We try: add the representative item -> open the cart -> checkout
 *          -> read the lines (parseCheckoutText). Logged-out sessions get subtotal + delivery
 *          fee + ETA and the missing lines are 0 (logged at debug level once).
 *
 * NOTE: ubereats.com was Cloudflare-blocked from the sandbox this was written in, so the
 * selectors below carry several candidates each and every step is optional.
 */
import type { Page } from 'playwright';
import type { Offer } from '../models/types';
import { computeTotal } from '../pricing/computeTotal';
import { geocodeZip, type ZipLocation } from '../services/zipGeo';
import { getContext } from './browser';
import { parseCheckoutText, parseUberEatsSearch, parseUberEatsStore, pickUberEatsSubtotal, uberEatsPromo, type UberEatsListing, type UberEatsStore } from './parsers/ubereats';
import { parseEta, parseMoney, parseRating } from './parsers/common';
import { PlaywrightScraper, ResponseCapture, round2 } from './scraperBase';
import { type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

const CAPTURE_MS = 15000;

/** The `uev2.loc` cookie value Uber's web app writes after you pick an address. */
export function uberLocationCookie(loc: ZipLocation): string {
  const address = {
    address1: loc.city,
    address2: `${loc.state} ${loc.zip}, USA`,
    aptOrSuite: '',
    eaterFormattedAddress: `${loc.city}, ${loc.state} ${loc.zip}, USA`,
    subtitle: `${loc.state} ${loc.zip}, USA`,
    title: loc.city,
    uuid: '',
  };
  return encodeURIComponent(
    JSON.stringify({
      address,
      latitude: loc.lat,
      longitude: loc.lng,
      reference: '',
      referenceType: 'google_places',
      type: 'google_places',
      source: 'manual_auto_complete',
      addressComponents: { city: loc.city, countryCode: 'US', firstLevelSubdivisionCode: loc.state, postalCode: loc.zip },
      categories: [],
      originId: '',
      validatedByNL: false,
    }),
  );
}

export class UberEatsAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'ubereats' as const;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.ubereats.com/store/${platformRestaurantId.replace(/^\/+/, '')}`;
  }

  /** Cookie first (verified location), typeahead second. Returns false when neither worked. */
  async setDeliveryLocation(page: Page, zip: string): Promise<boolean> {
    if (this.addressSetForZip === zip) return true;
    const loc = await geocodeZip(zip);
    if (loc) {
      const ctx = await getContext('ubereats');
      await ctx.addCookies([{ name: 'uev2.loc', value: uberLocationCookie(loc), domain: '.ubereats.com', path: '/', secure: true, sameSite: 'Lax' }]);
      this.addressSetForZip = zip;
      return true;
    }
    try {
      if (!/ubereats\.com/.test(page.url())) await this.open(page, 'https://www.ubereats.com/');
      const input = page
        .locator('input[data-testid*="location" i], input[placeholder*="address" i], input[aria-label*="address" i], input[name="location"]')
        .first();
      await input.click({ timeout: 8000 });
      await input.fill(zip);
      await page.waitForTimeout(2500);
      const option = page.locator('[role="option"], [data-testid*="suggestion" i] li, ul[role="listbox"] li').first();
      if ((await option.count()) > 0) await option.click({ timeout: 5000 });
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      this.addressSetForZip = zip;
      return true;
    } catch (err) {
      this.debug('address typeahead', err instanceof Error ? err.message.split('\n')[0] : String(err));
      return false;
    }
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    const page = await this.page();
    const located = await this.setDeliveryLocation(page, zip);
    const capture = new ResponseCapture(page, [{ key: 'feed', url: /\/_p\/api\/(getSearchFeedV1|getFeedV1|getSearchSuggestionsV1|getFeedItemsUpdateV1)/, accept: (b) => /storeUuid|"store"/.test(b) }]);
    try {
      await this.open(page, `https://www.ubereats.com/search?q=${encodeURIComponent(query)}&diningMode=DELIVERY`);
      await page.waitForTimeout(2500);
      let rows = parseUberEatsSearch(await page.content());
      if (rows.length === 0) {
        const body = await capture.wait('feed', CAPTURE_MS);
        if (body) rows = parseUberEatsSearch(body);
      }
      if (rows.length === 0) rows = await this.domSearchFallback(page);
      if (rows.length === 0) this.debug('search results', 'no store cards in state, feed RPC or DOM');
      void located;
      return rows.map((r) => this.toListing(r, zip));
    } finally {
      capture.stop();
      await this.closePage(page);
    }
  }

  private async domSearchFallback(page: Page): Promise<UberEatsListing[]> {
    try {
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/store/"]')].map((a) => ({
          href: a.getAttribute('href') ?? '',
          name: (a.querySelector('h3, h2, [data-testid="rich-text"]')?.textContent ?? a.getAttribute('aria-label') ?? '').trim(),
          text: (a.textContent ?? '').replace(/\s+/g, ' '),
          img: a.querySelector('img')?.getAttribute('src') ?? undefined,
        })),
      );
      const seen = new Set<string>();
      const out: UberEatsListing[] = [];
      for (const c of cards) {
        const id = c.href.match(/\/store\/([^?#]+)/)?.[1]?.replace(/\/$/, '');
        if (!id || !c.name || seen.has(id)) continue;
        seen.add(id);
        const eta = parseEta(c.text);
        const fee = c.text.match(/(\$\s*\d+(?:\.\d{2})?|free)\s*delivery/i)?.[1];
        out.push({ id, name: c.name, url: `https://www.ubereats.com/store/${id}`, cuisines: [], ...parseRating(c.text), imageUrl: c.img, deliveryFee: parseMoney(fee ?? null), etaMin: eta?.[0], etaMax: eta?.[1] });
      }
      return out;
    } catch {
      return [];
    }
  }

  private toListing(r: UberEatsListing, zip: string): PlatformListing {
    return {
      platformSlug: 'ubereats',
      platformRestaurantId: r.id,
      name: r.name,
      address: r.street ?? '',
      zip: r.zip ?? zip,
      cuisine: r.cuisines,
      rating: r.rating,
      ratingCount: r.ratingCount,
      imageUrl: r.imageUrl,
      url: r.url ?? this.storeUrl(r.id),
      deliveryFee: r.deliveryFee,
      etaMin: r.etaMin,
      etaMax: r.etaMax,
    };
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    const page = await this.page();
    const located = await this.setDeliveryLocation(page, zip);
    const capture = new ResponseCapture(page, [{ key: 'store', url: /\/_p\/api\/getStoreV1/, accept: (b) => b.includes('"uuid"') }]);
    try {
      await this.open(page, this.storeUrl(platformRestaurantId));
      await page.waitForTimeout(2000);
      let store: UberEatsStore | null = parseUberEatsStore(await page.content());
      if (!store) {
        const body = await capture.wait('store', CAPTURE_MS);
        store = body ? parseUberEatsStore(body) : null;
      }
      const headerText = await this.headerText(page);
      if (!store) {
        this.debug('store payload', platformRestaurantId);
        store = { id: platformRestaurantId, cuisines: [], items: await this.domItems(page) };
      }
      if (store.items.length === 0) store.items = await this.domItems(page);
      if (store.deliveryFee === undefined) store.deliveryFee = parseMoney(headerText.match(/(\$\s*\d+(?:\.\d{2})?|free)\s*delivery/i)?.[1] ?? null);
      if (store.etaMin === undefined) {
        const eta = parseEta(headerText);
        store.etaMin = eta?.[0];
        store.etaMax = eta?.[1];
      }

      const picked = pickUberEatsSubtotal(store.items, cart);
      let subtotal = picked.subtotal;
      const lines = subtotal > 0 ? await this.checkoutLines(page, picked.matched[0]?.name ?? picked.representative?.name) : {};
      if (lines.subtotal && lines.subtotal > 0) subtotal = lines.subtotal;
      if (subtotal <= 0) subtotal = round2((cart[0]?.unitPrice ?? 0) * Math.max(1, cart[0]?.quantity ?? 1));
      if (subtotal <= 0) throw new Error(`ubereats: no priced menu item found for store ${platformRestaurantId}`);

      const deliveryFee = lines.deliveryFee ?? store.deliveryFee;
      if (deliveryFee === undefined) this.debug('delivery fee', platformRestaurantId);
      if (lines.serviceFee === undefined && store.serviceFee === undefined) this.debug('service fee', 'only visible on the signed-in checkout page');
      if (lines.tax === undefined) this.debug('tax', 'only visible on the signed-in checkout page');

      const base = {
        platformSlug: 'ubereats' as const,
        subtotal,
        serviceFee: lines.serviceFee ?? store.serviceFee ?? 0,
        deliveryFee: deliveryFee ?? 0,
        smallOrderFee: lines.smallOrderFee ?? 0,
        tax: lines.tax ?? 0,
      };
      const { total } = computeTotal(base, [], [], 0.15, options.at ?? new Date());
      const rep = picked.matched[0] ?? picked.representative;
      return {
        restaurantId: platformRestaurantId,
        platformRestaurantId,
        ...base,
        total,
        etaMin: store.etaMin ?? 0,
        etaMax: store.etaMax ?? store.etaMin ?? 0,
        promo: uberEatsPromo(store, options.at ?? new Date()),
        fetchedAt: options.at ?? new Date(),
        deepLink: page.url().split('?')[0] || this.storeUrl(platformRestaurantId),
        ...(rep ? { representativeItem: { name: rep.name, price: rep.price } } : {}),
        ...(located ? {} : { locationUnverified: true }),
      };
    } finally {
      capture.stop();
      await this.closePage(page);
    }
  }

  private async headerText(page: Page): Promise<string> {
    try {
      const h = page.locator('[data-testid="store-header"], header, main').first();
      return ((await h.innerText({ timeout: 3000 })) ?? '').replace(/\s+/g, ' ');
    } catch {
      return '';
    }
  }

  private async domItems(page: Page): Promise<UberEatsStore['items']> {
    try {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="store-item"], li[data-testid*="item" i], a[href*="mod=quickView"], a[href*="modctx"]')].map((el, i) => ({
          id: el.getAttribute('data-testid') ?? `dom-${i}`,
          name: (el.querySelector('[data-testid="rich-text"], h3, h4, span')?.textContent ?? '').trim(),
          text: (el.textContent ?? '').replace(/\s+/g, ' '),
        })),
      );
      return rows
        .map((r) => ({ id: r.id, name: r.name, price: parseMoney(r.text.match(/\$\s*\d+(?:\.\d{2})?/)?.[0] ?? null) ?? 0 }))
        .filter((r) => r.name && r.price > 0);
    } catch {
      return [];
    }
  }

  /** Best-effort: add one item, open the cart, read the fee lines, remove the item. */
  private async checkoutLines(page: Page, itemName: string | undefined): Promise<ReturnType<typeof parseCheckoutText>> {
    if (!itemName || process.env.SCRAPER_SKIP_CART === '1') return {};
    try {
      const item = page.locator('[data-testid^="store-item"], li, a', { hasText: itemName }).first();
      await item.click({ timeout: 5000 });
      const add = page.locator('button', { hasText: /add \d+ to order|add to order|add to cart/i }).first();
      await add.click({ timeout: 8000 });
      await page.waitForTimeout(2000);
      const cartBtn = page.locator('[data-testid="cart-button"], button[aria-label*="cart" i], a[href*="/checkout"]').first();
      await cartBtn.click({ timeout: 5000 }).catch(() => undefined);
      const checkout = page.locator('a[href*="/checkout"], button', { hasText: /checkout/i }).first();
      await checkout.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(4000);
      const text = await page.evaluate(() => document.body?.innerText ?? '');
      const lines = parseCheckoutText(text);
      const remove = page.locator('[data-testid="cart-item-remove"], button[aria-label*="remove" i], button', { hasText: /^remove$/i }).first();
      await remove.click({ timeout: 3000 }).catch(() => undefined);
      return lines;
    } catch (err) {
      this.debug('checkout flow', err instanceof Error ? err.message.split('\n')[0] : String(err));
      return {};
    }
  }
}
