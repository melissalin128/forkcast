/**
 * DoorDash live scraper.
 *
 * Location: DoorDash has no location cookie we can set safely, so we drive the
 * address modal on the home page (button "Enter delivery address" / address
 * autocomplete -> first suggestion -> Save). The persistent profile keeps it.
 *
 * Search:  /search/store/<query>/?pickup=false -> the page's own GraphQL
 *          `searchWithFilterFacetFeed` response (see parsers/doordash.ts), else the SSR
 *          state, else DOM store cards.
 * Store:   /store/<id>/ -> GraphQL `storepageFeed` (header: delivery fee, ETA, ratings;
 *          item lists with display prices), else SSR state, else DOM.
 * Fees:    service fee / small order fee / estimated tax only show on the checkout page,
 *          which needs a signed-in account. Best effort: add the representative item,
 *          open the cart, click Checkout, read the lines, remove the item. Logged-out
 *          sessions get subtotal + delivery fee + ETA and 0 for the missing lines.
 *
 * NOTE: doordash.com was Cloudflare-blocked from the sandbox this was written in
 * (HTTP 403 + "Performing security verification" for every request), so every
 * selector carries several candidates and every step is optional.
 */
import type { Page } from 'playwright';
import type { Offer } from '../models/types';
import { computeTotal } from '../pricing/computeTotal';
import { geocodeZip } from '../services/zipGeo';
import { doorDashPromo, parseCheckoutText, parseDoorDashSearch, parseDoorDashStore, pickDoorDashSubtotal, type DoorDashListing, type DoorDashStore } from './parsers/doordash';
import { parseEta, parseMoney, parseRating } from './parsers/common';
import { PlaywrightScraper, ResponseCapture, round2 } from './scraperBase';
import { type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

const CAPTURE_MS = 15000;

export class DoorDashAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'doordash' as const;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.doordash.com/store/${encodeURIComponent(platformRestaurantId)}/`;
  }

  /** Address modal flow. Returns false when it could not be completed. */
  async setDeliveryLocation(page: Page, zip: string): Promise<boolean> {
    if (this.addressSetForZip === zip) return true;
    const loc = await geocodeZip(zip);
    const typed = loc ? loc.label : zip;
    try {
      if (!/doordash\.com/.test(page.url())) await this.open(page, 'https://www.doordash.com/');
      const trigger = page
        .locator('[data-testid="AddressTextButton"], button[aria-label*="address" i], button:has-text("Enter delivery address"), button:has-text("Delivery to")')
        .first();
      await trigger.click({ timeout: 8000 }).catch(() => undefined);
      const input = page
        .locator('[data-testid="AddressAutocompleteField"], input[placeholder*="address" i], input[aria-label*="address" i], input[name="address"]')
        .first();
      await input.click({ timeout: 8000 });
      await input.fill(typed);
      await page.waitForTimeout(2500);
      const option = page.locator('[data-testid="AddressAutocompleteSuggestion"], [role="option"], ul[role="listbox"] li').first();
      if ((await option.count()) > 0) await option.click({ timeout: 5000 });
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      const save = page.locator('button:has-text("Save"), button:has-text("Confirm"), button[data-testid="AddressEditSaveButton"]').first();
      await save.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      this.addressSetForZip = zip;
      return true;
    } catch (err) {
      this.debug('address modal', err instanceof Error ? err.message.split('\n')[0] : String(err));
      return false;
    }
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    const page = await this.page();
    const capture = new ResponseCapture(page, [{ key: 'search', url: /\/graphql\/(searchWithFilterFacetFeed|homePageFacetFeed|facetFeed|search)/i, accept: (b) => /store/i.test(b) }]);
    try {
      await this.setDeliveryLocation(page, zip);
      await this.open(page, `https://www.doordash.com/search/store/${encodeURIComponent(query)}/?pickup=false`);
      let rows: DoorDashListing[] = [];
      const body = await capture.wait('search', CAPTURE_MS);
      if (body) rows = parseDoorDashSearch(body);
      if (rows.length === 0) rows = parseDoorDashSearch(await page.content());
      if (rows.length === 0) rows = await this.domSearchFallback(page);
      if (rows.length === 0) this.debug('search results', 'no store rows in GraphQL, SSR state or DOM');
      return rows.map((r) => this.toListing(r, zip));
    } finally {
      capture.stop();
      await this.closePage(page);
    }
  }

  private async domSearchFallback(page: Page): Promise<DoorDashListing[]> {
    try {
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/store/"]')].map((a) => ({
          href: a.getAttribute('href') ?? '',
          name: (a.querySelector('[data-testid="StoreNameText"], h3, h2, span[data-anchor-id="StoreCardName"]')?.textContent ?? a.getAttribute('aria-label') ?? '').trim(),
          text: (a.closest('[data-anchor-id="StoreCard"]')?.textContent ?? a.textContent ?? '').replace(/\s+/g, ' '),
          img: a.querySelector('img')?.getAttribute('src') ?? undefined,
        })),
      );
      const seen = new Set<string>();
      const out: DoorDashListing[] = [];
      for (const c of cards) {
        const id = c.href.match(/\/store\/(?:[^/]*-)?(\d+)\/?/)?.[1];
        if (!id || !c.name || seen.has(id)) continue;
        seen.add(id);
        const eta = parseEta(c.text);
        const fee = c.text.match(/(\$\s*\d+(?:\.\d{2})?|free)\s*delivery/i)?.[1];
        out.push({ id, name: c.name, url: `https://www.doordash.com/store/${id}/`, cuisines: [], ...parseRating(c.text), imageUrl: c.img, deliveryFee: parseMoney(fee ?? null), etaMin: eta?.[0], etaMax: eta?.[1] });
      }
      return out;
    } catch {
      return [];
    }
  }

  private toListing(r: DoorDashListing, zip: string): PlatformListing {
    return {
      platformSlug: 'doordash',
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
    const id = platformRestaurantId.match(/(\d+)\s*\/?$/)?.[1] ?? platformRestaurantId;
    const page = await this.page();
    const capture = new ResponseCapture(page, [{ key: 'store', url: /\/graphql\/(storepageFeed|storePage|itemLists)/i, accept: (b) => /storeHeader|itemLists|displayPrice/.test(b) }]);
    try {
      const located = await this.setDeliveryLocation(page, zip);
      await this.open(page, this.storeUrl(id));
      let store: DoorDashStore | null = null;
      const body = await capture.wait('store', CAPTURE_MS);
      if (body) store = parseDoorDashStore(body);
      if (!store) store = parseDoorDashStore(await page.content());
      const headerText = await this.headerText(page);
      if (!store) {
        this.debug('store payload', id);
        store = { id, cuisines: [], items: [] };
      }
      if (store.items.length === 0) store.items = await this.domItems(page);
      if (store.deliveryFee === undefined) store.deliveryFee = parseMoney(headerText.match(/(\$\s*\d+(?:\.\d{2})?|free)\s*delivery/i)?.[1] ?? null);
      if (store.etaMin === undefined) {
        const eta = parseEta(headerText);
        store.etaMin = eta?.[0];
        store.etaMax = eta?.[1];
      }

      const picked = pickDoorDashSubtotal(store.items, cart);
      let subtotal = picked.subtotal;
      const lines = subtotal > 0 ? await this.checkoutLines(page, picked.matched[0]?.name ?? picked.representative?.name) : {};
      if (lines.subtotal && lines.subtotal > 0) subtotal = lines.subtotal;
      if (subtotal <= 0) subtotal = round2((cart[0]?.unitPrice ?? 0) * Math.max(1, cart[0]?.quantity ?? 1));
      if (subtotal <= 0) throw new Error(`doordash: no priced menu item found for store ${id}`);

      const deliveryFee = lines.deliveryFee ?? store.deliveryFee;
      if (deliveryFee === undefined) this.debug('delivery fee', id);
      if (lines.serviceFee === undefined) this.debug('service fee', 'only visible on the signed-in checkout page');
      if (lines.tax === undefined) this.debug('tax', 'only visible on the signed-in checkout page');

      const base = {
        platformSlug: 'doordash' as const,
        subtotal,
        serviceFee: lines.serviceFee ?? 0,
        deliveryFee: deliveryFee ?? 0,
        smallOrderFee: lines.smallOrderFee ?? 0,
        tax: lines.tax ?? 0,
      };
      const { total } = computeTotal(base, [], [], 0.15, options.at ?? new Date());
      const rep = picked.matched[0] ?? picked.representative;
      return {
        restaurantId: id,
        platformRestaurantId: id,
        ...base,
        total,
        etaMin: store.etaMin ?? 0,
        etaMax: store.etaMax ?? store.etaMin ?? 0,
        promo: doorDashPromo(store, options.at ?? new Date()),
        fetchedAt: options.at ?? new Date(),
        deepLink: this.storeUrl(id),
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
      const h = page.locator('[data-testid="StoreHeader"], [data-anchor-id="StoreHeader"], header, main').first();
      return ((await h.innerText({ timeout: 3000 })) ?? '').replace(/\s+/g, ' ');
    } catch {
      return '';
    }
  }

  private async domItems(page: Page): Promise<DoorDashStore['items']> {
    try {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-anchor-id="MenuItem"], [data-testid^="MenuItem"], div[data-item-id]')].map((el, i) => ({
          id: el.getAttribute('data-item-id') ?? `dom-${i}`,
          name: (el.querySelector('[data-testid="MenuItemName"], h3, h4, span')?.textContent ?? '').trim(),
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

  /** Best-effort: add one item, open the cart, click Checkout, read the fee lines, remove the item. */
  private async checkoutLines(page: Page, itemName: string | undefined): Promise<ReturnType<typeof parseCheckoutText>> {
    if (!itemName || process.env.SCRAPER_SKIP_CART === '1') return {};
    try {
      const item = page.locator('[data-anchor-id="MenuItem"], [data-testid^="MenuItem"], button, a', { hasText: itemName }).first();
      await item.click({ timeout: 5000 });
      const add = page.locator('button', { hasText: /add to cart|add \d+ to cart|add \$|add item/i }).first();
      await add.click({ timeout: 8000 });
      await page.waitForTimeout(2000);
      const cartBtn = page.locator('[data-testid="OrderCartButton"], button[aria-label*="cart" i], a[href*="/cart"]').first();
      await cartBtn.click({ timeout: 5000 }).catch(() => undefined);
      const checkout = page.locator('button, a', { hasText: /checkout/i }).first();
      await checkout.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(4000);
      const text = await page.evaluate(() => document.body?.innerText ?? '');
      const lines = parseCheckoutText(text);
      const remove = page.locator('[data-testid="RemoveItemButton"], button[aria-label*="remove" i], button', { hasText: /^remove$/i }).first();
      await remove.click({ timeout: 3000 }).catch(() => undefined);
      return lines;
    } catch (err) {
      this.debug('checkout flow', err instanceof Error ? err.message.split('\n')[0] : String(err));
      return {};
    }
  }
}
