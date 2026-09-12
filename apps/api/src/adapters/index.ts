import type { PlatformSlug } from '../models/types';
import { config } from '../config';
import { DoorDashAdapter } from './doordash';
import { GrubhubAdapter } from './grubhub';
import { MockAdapter } from './mock';
import type { PlatformAdapter } from './types';
import { UberEatsAdapter } from './ubereats';

export * from './types';
export { MockAdapter, demandMultiplier, hourBucket, FEE_PROFILES } from './mock';
export { BlockedError } from './scraperBase';
export { DoorDashAdapter, GrubhubAdapter, UberEatsAdapter };

export type AdapterMode = 'mock' | 'live';

/**
 * ADAPTER=mock (default) -> deterministic mock for every platform.
 * ADAPTER=live           -> Playwright scrapers (src/adapters/{doordash,ubereats,grubhub}.ts).
 */
export function createAdapters(mode: string = config.adapter): Record<PlatformSlug, PlatformAdapter> {
  if (mode === 'live') {
    return {
      doordash: new DoorDashAdapter(),
      ubereats: new UberEatsAdapter(),
      grubhub: new GrubhubAdapter(),
    };
  }
  if (mode !== 'mock') {
    console.warn(`[adapters] unknown ADAPTER="${mode}", falling back to mock`);
  }
  return {
    doordash: new MockAdapter('doordash'),
    ubereats: new MockAdapter('ubereats'),
    grubhub: new MockAdapter('grubhub'),
  };
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

export const adapterMode = (): AdapterMode => (config.adapter === 'live' ? 'live' : 'mock');
