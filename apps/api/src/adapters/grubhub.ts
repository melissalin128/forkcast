/**
 * Grubhub scraper SKELETON. Runtime behaviour: throws NotImplementedError.
 */
import type { Offer } from '../models/types';
import { PlaywrightScraper } from './scraperBase';
import { NotImplementedError, type Cart, type FetchOfferOptions, type PlatformAdapter, type PlatformListing } from './types';

export class GrubhubAdapter extends PlaywrightScraper implements PlatformAdapter {
  readonly platformSlug = 'grubhub' as const;

  storeUrl(platformRestaurantId: string): string {
    return `https://www.grubhub.com/restaurant/${platformRestaurantId}`;
  }

  async searchRestaurants(zip: string, query = ''): Promise<PlatformListing[]> {
    await this.throttle();
    // TODO(live):
    // const page = await this.page();
    // await this.ensureAddress(page, zip);
    //   -> '[data-testid="address-input"]' on the home page; Grubhub geocodes the zip and keeps it in localStorage + cookies.
    // await page.goto(`https://www.grubhub.com/search?queryText=${encodeURIComponent(query)}&location=${zip}`, { waitUntil: 'networkidle' });
    // const cards = page.locator('[data-testid="restaurant-card"]');
    //   name: '[data-testid="restaurant-name"]', id: href "/restaurant/<slug>/<id>", cuisine: '[data-testid="cuisine-list"]',
    //   rating: '[data-testid="star-rating-text"]', fee/eta: '[data-testid="delivery-fee"]', '[data-testid="delivery-time"]'.
    // Grubhub's search also calls https://api-gtm.grubhub.com/restaurants/search — intercept it with
    //   page.on('response') and parse JSON instead of the DOM when available.
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
    //    header: '[data-testid="delivery-fee"]' ("$1.99 delivery"), '[data-testid="delivery-eta"]' ("30-40 min").
    // 3. Menu price: '[data-testid="menu-item"]' hasText cart[0]?.name -> '[data-testid="menu-item-price"]'.
    // 4. Add item: click -> 'button:has-text("Add to bag")'; open bag: '[data-testid="cart-button"]'; 'a:has-text("Proceed to checkout")'.
    // 5. Checkout '[data-testid="order-summary"]' rows: "Items subtotal", "Delivery fee", "Service fee", "Small order fee", "Sales tax".
    //    Promo: '[data-testid="promo-code-applied"]' or the "perks" banner -> { code, rule, endsAt }.
    // 6. Clear bag: '[data-testid="remove-item"]'.
    // 7. Return Offer.
    void platformRestaurantId;
    void zip;
    void cart;
    void options;
    throw new NotImplementedError('live scraping not wired yet');
  }
}
