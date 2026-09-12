/**
 * One shared Chromium launcher for the three live scrapers.
 *
 *  - `chromium.launchPersistentContext(userDataDir)` so cookies, the delivery
 *    address and any bot-challenge clearance persist between runs. The profile
 *    lives in apps/api/.browser-profile/<platform> (git-ignored).
 *  - Realistic desktop fingerprint: Chrome UA, 1366x900, en-US, America/New_York.
 *  - Images / fonts / media are blocked to keep page loads fast.
 *  - A per-platform throttle spaces navigations >= 2.5 s apart.
 *
 * Environment:
 *   SCRAPER_HEADLESS        "true" (default) | "false"  -> run a visible window (first run: solve
 *                           the bot challenge and set your address there; it persists in the profile)
 *   SCRAPER_SLOWMO_MS       slow every Playwright action down (debugging), default 0
 *   SCRAPER_PROXY           proxy server URL for Chromium; defaults to HTTPS_PROXY when set
 *   SCRAPER_NO_PROXY        comma list of hosts that bypass the proxy; defaults to NO_PROXY
 *   SCRAPER_CHROMIUM_ARGS   extra Chromium flags, space separated (e.g. "--disable-features=UseMLKEM")
 *   SCRAPER_NAV_TIMEOUT_MS  navigation timeout, default 45000
 *   SCRAPER_DEBUG_DIR       when set, every failed step dumps a screenshot + HTML here
 *   SCRAPER_PROFILE_DIR     override the profile root (default apps/api/.browser-profile)
 *   SCRAPER_FETCH_BRIDGE    "1" -> every request is fetched by Playwright's Node-side HTTP client
 *                           (route.fetch) and handed to the page. Only for sandboxes / corporate
 *                           proxies whose TLS interception rejects Chromium's own handshake; TLS is
 *                           still verified (Node trusts NODE_EXTRA_CA_CERTS). Not needed on a laptop.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page, Route } from 'playwright';
import type { PlatformSlug } from '../models/types';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export const MIN_NAV_GAP_MS = 2500;

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);

export interface BrowserSettings {
  headless: boolean;
  slowMo: number;
  proxy?: { server: string; bypass?: string };
  extraArgs: string[];
  navTimeoutMs: number;
  debugDir?: string;
  profileRoot: string;
  fetchBridge: boolean;
}

const envBool = (v: string | undefined, dflt: boolean): boolean => {
  if (v === undefined || v.trim() === '') return dflt;
  return !/^(0|false|no|off)$/i.test(v.trim());
};

/** Resolve settings from the environment (read lazily so tests can set vars first). */
export function browserSettings(env: NodeJS.ProcessEnv = process.env): BrowserSettings {
  const proxyServer = env.SCRAPER_PROXY?.trim() || env.HTTPS_PROXY?.trim() || env.https_proxy?.trim();
  const bypass = env.SCRAPER_NO_PROXY?.trim() || env.NO_PROXY?.trim() || env.no_proxy?.trim();
  return {
    headless: envBool(env.SCRAPER_HEADLESS, true),
    slowMo: Math.max(0, Number(env.SCRAPER_SLOWMO_MS ?? 0) || 0),
    proxy: proxyServer ? { server: proxyServer, ...(bypass ? { bypass } : {}) } : undefined,
    extraArgs: (env.SCRAPER_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean),
    navTimeoutMs: Math.max(5000, Number(env.SCRAPER_NAV_TIMEOUT_MS ?? 45000) || 45000),
    debugDir: env.SCRAPER_DEBUG_DIR?.trim() || undefined,
    // apps/api/src/adapters -> apps/api ; apps/api/dist/adapters -> apps/api
    profileRoot: env.SCRAPER_PROFILE_DIR?.trim() || path.resolve(__dirname, '../../.browser-profile'),
    fetchBridge: envBool(env.SCRAPER_FETCH_BRIDGE, false),
  };
}

const contexts = new Map<PlatformSlug, Promise<BrowserContext>>();
const lastNavAt = new Map<PlatformSlug, number>();

/** Space page navigations >= MIN_NAV_GAP_MS apart per platform so we behave like one slow human. */
export async function throttle(platform: PlatformSlug): Promise<void> {
  const wait = (lastNavAt.get(platform) ?? 0) + MIN_NAV_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNavAt.set(platform, Date.now());
}

/** The persistent context for a platform, launched on first use. */
export function getContext(platform: PlatformSlug): Promise<BrowserContext> {
  let ctx = contexts.get(platform);
  if (!ctx) {
    ctx = launch(platform);
    contexts.set(platform, ctx);
    ctx.catch(() => contexts.delete(platform));
  }
  return ctx;
}

async function launch(platform: PlatformSlug): Promise<BrowserContext> {
  const s = browserSettings();
  const userDataDir = path.join(s.profileRoot, platform);
  fs.mkdirSync(userDataDir, { recursive: true });
  const { chromium } = await import('playwright');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: s.headless,
    slowMo: s.slowMo || undefined,
    proxy: s.proxy,
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', ...s.extraArgs],
  });
  ctx.setDefaultNavigationTimeout(s.navTimeoutMs);
  ctx.setDefaultTimeout(Math.min(15000, s.navTimeoutMs));
  await ctx.route('**/*', async (route: Route) => {
    const req = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) return route.abort();
    if (!s.fetchBridge) return route.continue();
    // Bridge mode: streaming endpoints never finish, so drop them; everything else is fetched
    // by the Node-side client and replayed into the page.
    if ((req.headers()['accept'] ?? '').includes('text/event-stream')) return route.abort();
    try {
      const res = await route.fetch({ timeout: s.navTimeoutMs });
      await route.fulfill({ response: res });
    } catch {
      await route.abort().catch(() => undefined);
    }
  });
  ctx.on('close', () => contexts.delete(platform));
  console.error(
    `[browser:${platform}] chromium ${s.headless ? 'headless' : 'headed'} profile=${userDataDir}${s.proxy ? ` proxy=${s.proxy.server}` : ''}${s.fetchBridge ? ' fetch-bridge' : ''}`,
  );
  return ctx;
}

/**
 * A fresh page in the platform's context. Callers close it when done; if
 * `SCRAPER_HEADLESS=false` we reuse the first tab so the user sees one window.
 */
export async function newPage(platform: PlatformSlug): Promise<Page> {
  const ctx = await getContext(platform);
  const existing = ctx.pages().find((p) => !p.isClosed());
  if (existing && !browserSettings().headless) return existing;
  return ctx.newPage();
}

/** Throttled navigation that returns the HTTP status (or null for non-HTTP navigations). */
export async function gotoThrottled(platform: PlatformSlug, page: Page, url: string): Promise<number | null> {
  await throttle(platform);
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  return res ? res.status() : null;
}

/** Dump a screenshot and the HTML for post-mortems when SCRAPER_DEBUG_DIR is set. */
export async function debugDump(platform: PlatformSlug, page: Page, label: string): Promise<void> {
  const dir = browserSettings().debugDir;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(dir, `${platform}-${label}-${stamp}`);
    await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => undefined);
    fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''));
    console.error(`[browser:${platform}] debug dump -> ${base}.{png,html}`);
  } catch {
    /* best effort */
  }
}

/** Close one platform's browser (or all of them). */
export async function closeBrowsers(platform?: PlatformSlug): Promise<void> {
  const keys = platform ? [platform] : [...contexts.keys()];
  await Promise.all(
    keys.map(async (k) => {
      const p = contexts.get(k);
      contexts.delete(k);
      if (!p) return;
      try {
        const ctx = await p;
        await ctx.close();
      } catch {
        /* already closed */
      }
    }),
  );
}

/** Text of the page body, cheaply and without throwing. */
export async function bodyText(page: Page, max = 20000): Promise<string> {
  try {
    const t = await page.evaluate(() => document.body?.innerText ?? '');
    return t.slice(0, max);
  } catch {
    return '';
  }
}
