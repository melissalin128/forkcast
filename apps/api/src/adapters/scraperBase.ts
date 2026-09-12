/**
 * Shared scaffolding for the live Playwright scrapers (spec section 6).
 *
 *  - one persistent Chromium context per platform (see ./browser.ts)
 *  - one page navigation every >= 2.5 s per platform
 *  - block detection: HTTP 403/429 or an anti-bot interstitial -> BlockedError
 *  - ResponseCapture: collect the JSON the page itself fetches, so we parse
 *    the platform's own API payloads instead of scraping the DOM
 *
 * Scraper realities:
 *  - prices render only after a delivery address is set -> each adapter
 *    implements setDeliveryLocation(page, zip); when it fails the offer is
 *    still returned with `locationUnverified: true`
 *  - fees appear at checkout -> add one representative item, read the
 *    breakdown, clear the cart (or read the platform's quote API)
 */
import type { Page, Response } from 'playwright';
import type { PlatformSlug } from '../models/types';
import { bodyText, closeBrowsers, debugDump, gotoThrottled, newPage } from './browser';
import type { PlatformAdapter } from './types';

export { parseMoney, parseEta, parseRating, centsToDollars, round2, findFeeLine } from './parsers/common';

/** The platform refused to serve us (WAF, captcha, "access denied"). */
export class BlockedError extends Error {
  readonly status = 503;
  constructor(readonly platformSlug: PlatformSlug, readonly detail: string) {
    super(
      `${platformSlug}: blocked by the site's bot protection (${detail}). ` +
        `Re-run with SCRAPER_HEADLESS=false, pass the challenge in the browser window that opens and set your delivery address there, ` +
        `then run again; the profile in .browser-profile/${platformSlug} keeps the clearance.`,
    );
    this.name = 'BlockedError';
  }
}

export const BLOCK_TEXT_RE =
  /access denied|verify you are human|unusual traffic|captcha|just a moment|performing security verification|security service to protect|attention required|are you a robot|pardon our interruption|request blocked|enable javascript and cookies to continue/i;

/** Pure check used by isBlocked() and the tests. */
export function looksBlocked(status: number | null, title: string, text: string): string | null {
  const hay = `${title}\n${text.slice(0, 4000)}`;
  const m = hay.match(BLOCK_TEXT_RE);
  if (m) return `page says "${m[0]}"`;
  if (status === 403 || status === 429) return `HTTP ${status}`;
  return null;
}

export async function isBlocked(page: Page, status: number | null): Promise<string | null> {
  const title = await page.title().catch(() => '');
  const text = await bodyText(page, 4000);
  return looksBlocked(status, title, text);
}

// ---------------------------------------------------------------------------
// Response capture
// ---------------------------------------------------------------------------

export interface CapturePattern {
  key: string;
  /** Tested against the response URL. */
  url: RegExp;
  /** Optional body predicate; the first response whose body passes wins. */
  accept?: (body: string) => boolean;
}

/** Collects response bodies matching URL patterns while the page does its own fetching. */
export class ResponseCapture {
  private bodies = new Map<string, string>();
  private waiters = new Map<string, Array<() => void>>();
  private readonly handler: (res: Response) => void;

  constructor(
    private readonly page: Page,
    private readonly patterns: CapturePattern[],
  ) {
    this.handler = (res) => void this.onResponse(res);
    page.on('response', this.handler);
  }

  private async onResponse(res: Response): Promise<void> {
    const url = res.url();
    for (const p of this.patterns) {
      if (this.bodies.has(p.key) || !p.url.test(url)) continue;
      let body = '';
      try {
        body = await res.text();
      } catch {
        continue;
      }
      if (!body || (p.accept && !p.accept(body))) continue;
      this.bodies.set(p.key, body);
      for (const w of this.waiters.get(p.key) ?? []) w();
      this.waiters.delete(p.key);
    }
  }

  get(key: string): string | undefined {
    return this.bodies.get(key);
  }

  /** Resolve with the body or undefined after `timeoutMs`. */
  wait(key: string, timeoutMs: number): Promise<string | undefined> {
    const have = this.bodies.get(key);
    if (have !== undefined) return Promise.resolve(have);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.bodies.get(key)), timeoutMs);
      const list = this.waiters.get(key) ?? [];
      list.push(() => {
        clearTimeout(timer);
        resolve(this.bodies.get(key));
      });
      this.waiters.set(key, list);
    });
  }

  stop(): void {
    this.page.off('response', this.handler);
  }
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

const debugLogged = new Set<string>();

/** Log a parser miss once per (platform, field) so a changed selector shows up without spamming. */
export function debugOnce(platform: string, field: string, detail = ''): void {
  const key = `${platform}:${field}`;
  if (debugLogged.has(key)) return;
  debugLogged.add(key);
  if (process.env.SCRAPER_DEBUG || process.env.DEBUG) console.error(`[${platform}] could not read ${field}${detail ? `: ${detail}` : ''}`);
}

export const isHeadedRun = (): boolean => !!process.env.SCRAPER_HEADLESS && /^(0|false|no|off)$/i.test(process.env.SCRAPER_HEADLESS.trim());

export abstract class PlaywrightScraper {
  abstract readonly platformSlug: PlatformSlug;
  /** Zip for which the current profile's delivery address is known to be set. */
  protected addressSetForZip: string | null = null;

  protected async page(): Promise<Page> {
    return newPage(this.platformSlug);
  }

  /**
   * Throttled navigation + block detection. Cloudflare-style interstitials get
   * a few seconds to clear themselves; if they do not, BlockedError.
   */
  protected async open(page: Page, url: string): Promise<number | null> {
    let status: number | null = null;
    try {
      status = await gotoThrottled(this.platformSlug, page, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${this.platformSlug}: could not open ${url}: ${msg.split('\n')[0]}`);
    }
    let reason = await isBlocked(page, status);
    for (let i = 0; reason && i < 5; i += 1) {
      await page.waitForTimeout(3000);
      // Once the interstitial is gone the status of the original response no longer matters.
      reason = await isBlocked(page, null);
    }
    if (reason) {
      await debugDump(this.platformSlug, page, 'blocked');
      throw new BlockedError(this.platformSlug, reason);
    }
    return status;
  }

  /** Close the tab, unless the user is watching a headed run. */
  protected async closePage(page: Page): Promise<void> {
    if (isHeadedRun()) return;
    await page.close().catch(() => undefined);
  }

  protected debug(field: string, detail = ''): void {
    debugOnce(this.platformSlug, field, detail);
  }

  async close(): Promise<void> {
    await closeBrowsers(this.platformSlug);
    this.addressSetForZip = null;
  }
}

export type LiveAdapter = PlatformAdapter & PlaywrightScraper;
