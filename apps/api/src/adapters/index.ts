import { PLATFORM_SLUGS, type PlatformSlug } from '../models/types';
import { config } from '../config';
import { ApifyAdapter } from './apify';
import { DoorDashAdapter } from './doordash';
import { GrubhubAdapter } from './grubhub';
import { MockAdapter } from './mock';
import type { PlatformAdapter } from './types';
import { UberEatsAdapter } from './ubereats';

export * from './types';
export { MockAdapter, demandMultiplier, hourBucket, FEE_PROFILES } from './mock';
export { BlockedError } from './scraperBase';
export { ApifyAdapter, ApifyError, actorConfig, configuredPlatforms } from './apify';
export { DoorDashAdapter, GrubhubAdapter, UberEatsAdapter };

export type AdapterMode = 'mock' | 'live' | 'apify';

const MODES: AdapterMode[] = ['mock', 'live', 'apify'];

function parseMode(raw: string | undefined, name: string): AdapterMode | undefined {
  if (!raw) return undefined;
  if ((MODES as string[]).includes(raw)) return raw as AdapterMode;
  console.warn(`[adapters] unknown ${name}="${raw}", ignoring`);
  return undefined;
}

/**
 * The mode one platform runs in: ADAPTER_<PLATFORM> when set, else the base
 * mode (ADAPTER / --adapter), else mock. Lets ADAPTER=apify collect Uber Eats
 * and DoorDash through actors while ADAPTER_GRUBHUB=live scrapes Grubhub with
 * the local Playwright adapter, which needs no actor.
 */
export function platformMode(platform: PlatformSlug, base: string = config.adapter): AdapterMode {
  return parseMode(config.adapterOverrides[platform], `ADAPTER_${platform.toUpperCase()}`) ?? parseMode(base, 'ADAPTER') ?? 'mock';
}

function buildAdapter(platform: PlatformSlug, mode: AdapterMode): PlatformAdapter {
  if (mode === 'apify') return new ApifyAdapter(platform);
  if (mode === 'live') {
    if (platform === 'doordash') return new DoorDashAdapter();
    if (platform === 'ubereats') return new UberEatsAdapter();
    return new GrubhubAdapter();
  }
  return new MockAdapter(platform);
}

/**
 * ADAPTER=mock (default) -> deterministic mock for every platform.
 * ADAPTER=live           -> Playwright scrapers (src/adapters/{doordash,ubereats,grubhub}.ts).
 * ADAPTER=apify          -> Apify actors do the crawling (src/adapters/apify.ts);
 *                           needs APIFY_TOKEN + APIFY_<PLATFORM>_ACTOR.
 * ADAPTER_<PLATFORM>     -> overrides the mode for that one platform.
 */
export function createAdapters(mode: string = config.adapter): Record<PlatformSlug, PlatformAdapter> {
  return Object.fromEntries(
    PLATFORM_SLUGS.map((p) => [p, buildAdapter(p, platformMode(p, mode))]),
  ) as Record<PlatformSlug, PlatformAdapter>;
}

let cached: Record<PlatformSlug, PlatformAdapter> | null = null;

export function getAdapters(): Record<PlatformSlug, PlatformAdapter> {
  cached ??= createAdapters();
  return cached;
}

export function getAdapter(platform: PlatformSlug): PlatformAdapter {
  return getAdapters()[platform];
}

/** Release browsers held by the cached adapters (server shutdown, CLI exit). */
export async function closeAdapters(adapters: Record<PlatformSlug, PlatformAdapter> | null = cached): Promise<void> {
  if (!adapters) return;
  await Promise.all(Object.values(adapters).map((a) => a.close?.().catch(() => undefined)));
  if (adapters === cached) cached = null;
}

/** The base ADAPTER mode; ADAPTER_<PLATFORM> overrides are per-platform (see platformMode). */
export const adapterMode = (): AdapterMode =>
  config.adapter === 'live' ? 'live' : config.adapter === 'apify' ? 'apify' : 'mock';
