/**
 * One provider per platform. Fetching is generic (src/deals/apify.ts); a
 * provider only knows how to shape that platform's actor input and how to read
 * its output. Both halves are pure, so they are tested against saved fixtures
 * rather than live runs.
 */
import type { NewDeal, PlatformSlug } from '../../models/types';
import type { ActorConfig, AddressConfig } from '../config';

export interface FeedJobSpec {
  kind: 'feed';
  address: AddressConfig;
  /** Preset cuisine list from deals.config.json. */
  queries: string[];
  /** Hard cap on results for the whole run, from the cost guard. */
  maxResults: number;
  actor: ActorConfig;
}

export interface SearchJobSpec {
  kind: 'search';
  address: AddressConfig;
  /** What the user typed: a restaurant name or a cuisine. */
  query: string;
  maxResults: number;
  actor: ActorConfig;
}

export type JobSpec = FeedJobSpec | SearchJobSpec;

export interface NormalizeContext {
  address: AddressConfig;
  now: Date;
}

export interface NormalizeFailure {
  /** Index in the dataset, so a bad record can be found again in the raw run. */
  index: number;
  reason: string;
  /** Store id when we got far enough to read one. */
  platformRestaurantId?: string;
}

export interface NormalizeResult {
  deals: NewDeal[];
  failures: NormalizeFailure[];
  /** Dataset items that parsed fine but simply carried no deal. Not a failure. */
  storesWithoutDeals: number;
}

export interface DealProvider {
  readonly platform: PlatformSlug;
  /** Actor input for one run. Never includes secrets. */
  buildInput(job: JobSpec): Record<string, unknown>;
  /** Pure: dataset items in, deals out. Tolerant — a bad record is skipped and reported. */
  normalize(items: unknown[], ctx: NormalizeContext): NormalizeResult;
}
