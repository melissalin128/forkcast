/**
 * DoorDash scraper SKELETON. Runtime behaviour: throws NotImplementedError.
 * The navigation plan is spelled out as TODO code so wiring it is mechanical.
 */
import type { Offer } from '../models/types';
import { PlaywrightScraper } from './scraperBase';
import { NotImplementedError, type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

export class DoorDashAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'doordash' as const;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.doordash.com/store/${platformRestaurantId}/`;
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    await this.throttle();
    // TODO(live):
    // const page = await this.page();
    // await this.ensureAddress(page, zip);
    // await page.goto(`https://www.doordash.com/search/store/${encodeURIComponent(query)}/`, { waitUntil: 'networkidle' });
    // const cards = page.locator('[data-anchor-id="StoreCard"], a[href^="/store/"]');
    // const listings: PlatformListing[] = [];
    // for (const card of await cards.all()) {
    //   const href = await card.getAttribute('href');               // "/store/pamelas-diner-pittsburgh-1234567/"
    //   const id = href?.match(/-(\d+)\/?$/)?.[1];
    //   const name = await card.locator('[data-testid="StoreNameText"], h3').first().innerText();
    //   const meta = await card.locator('[data-testid="StoreMetaText"]').allInnerTexts();  // "4.6 (2k+) • American • 1.2 mi"
    //   listings.push({ platformSlug: 'doordash', platformRestaurantId: id!, name, address: '', cuisine: parseCuisine(meta), rating: parseRating(meta), url: this.storeUrl(id!) });
    // }
    // return listings;
    void zip;
    void query;
    throw new NotImplementedError('live scraping not wired yet');
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    await this.throttle();
    // TODO(live):
    // const page = await this.page();
    // 1. Delivery address (prices render only after this). Do it once per context.
    //    await this.ensureAddress(page, zip);
    //      -> click '[data-testid="AddressTextButton"]', fill 'input[placeholder*="address"]' with `${zip}`,
    //         pick the first suggestion, click "Save"; persist ctx.storageState() for reuse.
    // 2. Store page.
    //    await page.goto(this.storeUrl(platformRestaurantId), { waitUntil: 'networkidle' });
    //    const etaText = await page.locator('[data-testid="StoreHeaderEtaText"], span:has-text("min")').first().innerText(); // "25-40 min"
    // 3. Menu prices: read the representative item (or first entree) and its price.
    //    const item = page.locator('[data-anchor-id="MenuItem"]', { hasText: cart[0]?.name ?? '' }).first();
    //    const menuPrice = parseMoney(await item.locator('[data-testid="MenuItemPrice"]').innerText());
    // 4. Add one item to expose the checkout fee breakdown.
    //    await item.click(); await page.locator('button:has-text("Add to cart")').click();
    //    await page.locator('[data-testid="OrderCartButton"]').click();
    //    await page.locator('button:has-text("Checkout")').click();
    // 5. Read fees from the checkout drawer ("Subtotal", "Delivery Fee", "Service Fee", "Small Order Fee", "Estimated Tax").
    //    const line = (label: string) => parseMoney(await page.locator(`[data-testid="LineItem"]:has-text("${label}")`).innerText());
    //    const subtotal = line('Subtotal'), deliveryFee = line('Delivery Fee'), serviceFee = line('Service Fee'),
    //          smallOrderFee = line('Small Order Fee') || 0, tax = line('Estimated Tax');
    //    const promo = await readPromoBanner(page);   // "Get 20% off with WEEKNIGHT20" -> { code, rule, startsAt, endsAt }
    // 6. Clear the cart so the next fetch starts clean.
    //    await page.locator('[data-testid="RemoveItemButton"]').click();
    // 7. Return the Offer; the caller appends a PriceSnapshot and computes totals.
    //    const [etaMin, etaMax] = parseEta(etaText);
    //    return { restaurantId: '', platformSlug: 'doordash', platformRestaurantId, subtotal, serviceFee, deliveryFee, smallOrderFee, tax,
    //             total: computeTotal({...}).total, etaMin, etaMax, promo, fetchedAt: new Date() };
    void platformRestaurantId;
    void zip;
    void cart;
    void options;
    throw new NotImplementedError('live scraping not wired yet');
  }
}
