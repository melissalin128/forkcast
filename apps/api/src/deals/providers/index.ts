import type { PlatformSlug } from '../../models/types';
import { doorDashDealProvider } from './doordash';
import type { DealProvider } from './types';

export * from './types';
export { DoorDashDealProvider, doorDashDealProvider, searchUrl } from './doordash';

/**
 * DoorDash only for now. Uber Eats and Grubhub deals are out of scope; their
 * Playwright price adapters in src/adapters are a separate thing and untouched.
 */
const PROVIDERS: Partial<Record<PlatformSlug, DealProvider>> = {
  doordash: doorDashDealProvider,
};

export const dealPlatforms = (): PlatformSlug[] => Object.keys(PROVIDERS) as PlatformSlug[];

export function getDealProvider(platform: PlatformSlug): DealProvider {
  const p = PROVIDERS[platform];
  if (!p) throw new Error(`no deal provider for "${platform}" (deals are DoorDash-only for now)`);
  return p;
}
