/**
 * Uber Eats scraper SKELETON. Runtime behaviour: throws NotImplementedError.
 */
import type { Offer } from '../models/types';
import { PlaywrightScraper } from './scraperBase';
import { NotImplementedError, type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

export class UberEatsAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'ubereats' as const;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.ubereats.com/store/${platformRestaurantId}`;
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    await this.throttle();
    // TODO(live):
    // const page = await this.page();
    // await this.ensureAddress(page, zip);
    //   -> click '[data-testid="location-typeahead-input"]' / 'button:has-text("Enter delivery address")',
    //      type the zip, choose the first suggestion; Uber stores it in the `uev2.loc` cookie -> persist storageState.
    // await page.goto(`https://www.ubereats.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle' });
    // const cards = page.locator('a[href^="/store/"]');
    // for (const card of await cards.all()) {
    //   const href = await card.getAttribute('href');           // "/store/pamelas-diner/AbCd1234EfGh"
    //   const id = href?.split('/').pop()?.split('?')[0];       // the base64-ish store uuid
    //   const name = await card.locator('h3').innerText();
    //   const meta = await card.locator('[data-testid="rich-text"]').allInnerTexts(); // "4.6 • 20-35 min • $0.99 Delivery Fee"
    //   ...
    // }
    void zip;
    void query;
    throw new NotImplementedError('live scraping not wired yet');
  }

  async fetchOffer(platformRestaurantId: string, zip: string, cart: Cart, options: FetchOfferOptions = {}): Promise<Offer> {
    await this.throttle();
    // TODO(live):
    // const page = await this.page();
    // 1. await this.ensureAddress(page, zip);
    // 2. await page.goto(this.storeUrl(platformRestaurantId), { waitUntil: 'networkidle' });
    //    ETA + delivery fee are in the store header: '[data-testid="store-header"]' -> "$1.49 Delivery Fee • 20-35 min".
    //    Uber also embeds the store payload in a JSON script: page.locator('script#__REACT_QUERY_STATE__') / '__NEXT_DATA__'
    //    -> parse it instead of the DOM when present (fees, promotions, etaRange).
    // 3. Menu price: page.locator('[data-testid="menu-item"]', { hasText: cart[0]?.name }).first()
    // 4. Add to cart: click item -> 'button:has-text("Add 1 to order")'; open cart: '[data-testid="cart-button"]';
    //    checkout: 'a[href*="/checkout"]'.
    // 5. Checkout breakdown rows: "Subtotal", "Delivery Fee", "Service Fee", "Small Order Fee", "Taxes & Other Fees" (split tax out),
    //    promo banner '[data-testid="promotion-banner"]' -> promo code + rule.
    // 6. Clear cart: '[data-testid="cart-item-remove"]'.
    // 7. Return Offer.
    void platformRestaurantId;
    void zip;
    void cart;
    void options;
    throw new NotImplementedError('live scraping not wired yet');
  }
}
