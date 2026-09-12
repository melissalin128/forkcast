/**
 * Shared scaffolding for the live Playwright scrapers. Deliberately
 * dependency-free: `playwright` is NOT installed yet. When it is, replace the
 * `Browser`/`Page` placeholders with `import type { Browser, Page } from 'playwright'`.
 *
 * Scraper realities (spec section 6):
 *  - prices render only after a delivery address is set -> set it once per
 *    browser context via the address modal and reuse cookies
 *  - fees appear at checkout -> add one representative item, read the
 *    breakdown, clear the cart
 *  - rate-limit: one page every 2-3 s per platform; cache offers 10 min
 */
import { NotImplementedError, type PlatformAdapter } from './types';

// @ts-ignore -- playwright is intentionally not a dependency yet
export type Browser = unknown;
// @ts-ignore
export type Page = unknown;

const MIN_GAP_MS = 2500;

export abstract class PlaywrightScraper {
  protected browser: Browser | null = null;
  protected lastRequestAt = 0;
  protected addressSetForZip: string | null = null;

  /** Space page loads at least MIN_GAP_MS apart so we behave like one slow human. */
  protected async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  /** Placeholder until playwright is wired in. */
  protected async page(): Promise<Page> {
    // TODO(live):
    // const { chromium } = await import('playwright');
    // this.browser ??= await chromium.launch({ headless: true });
    // const ctx = await this.browser.newContext({ storageState: await this.loadCookies() });
    // return ctx.newPage();
    throw new NotImplementedError('live scraping not wired yet');
  }

  async close(): Promise<void> {
    // TODO(live): await this.browser?.close();
    this.browser = null;
  }
}

/** Shape check used by the adapter index; keeps TS honest about the interface. */
export type LiveAdapter = PlatformAdapter & PlaywrightScraper;
