/**
 * Which Apify actor runs for which platform, and what input it gets.
 *
 * Actors are configured, never hard-coded: every DoorDash / Uber Eats / Grubhub
 * actor on the Apify Store takes a different input shape, and the one you pick
 * depends on your account. So each platform reads
 *
 *   APIFY_<PLATFORM>_ACTOR         e.g. "some-user/doordash-scraper"
 *   APIFY_<PLATFORM>_INPUT         input template for searchRestaurants (JSON)
 *   APIFY_<PLATFORM>_STORE_ACTOR   optional; defaults to the search actor
 *   APIFY_<PLATFORM>_STORE_INPUT   input template for fetchOffer (JSON)
 *
 * Templates are JSON with `{{placeholders}}`:
 *   {{query}} {{zip}} {{limit}} {{address}} {{lat}} {{lng}}        (search)
 *   {{storeId}} {{storeUrl}} {{zip}} {{address}} {{lat}} {{lng}} {{item}}   (store)
 *
 * Copy the JSON from the actor's page in the Apify console ("Input" tab ->
 * "JSON" toggle) and swap the values you want driven by the search for the
 * placeholders above. Keys whose value resolves to an empty placeholder are
 * dropped before the run, so an unused `{{item}}` never reaches the actor.
 *
 * Always quote a placeholder ("maxItems": "{{limit}}") so the template stays
 * valid JSON; a string that is exactly one placeholder keeps the value's own
 * type, so that renders as the number 20, not "20".
 */
import type { PlatformSlug } from '../../models/types';
import { isObject, safeJson, type Json, type JsonObject } from '../parsers/common';

export interface ActorConfig {
  searchActor: string;
  searchInput: JsonObject;
  storeActor: string;
  storeInput: JsonObject;
}

export interface TemplateVars {
  query?: string;
  zip?: string;
  limit?: number;
  address?: string;
  /** Zip centroid, for actors that take a coordinate pair (more precise than an address string). */
  lat?: number;
  lng?: number;
  storeId?: string;
  storeUrl?: string;
  item?: string;
}

/**
 * Fallback templates, used when APIFY_<PLATFORM>_INPUT is unset.
 *
 * Uber Eats is tuned for borderline/uber-eats-scraper-ppr (the actor this
 * project uses): coordinates rather than an address string, RESTAURANTS rather
 * than every Uber vertical, and customization trees off — they multiply the run
 * time and the payload without changing any price we read.
 *
 * DoorDash is tuned for dz_omar/doordash-scraper: URL-driven like most DoorDash
 * actors, but with a real `address` input, so results and fees follow the zip.
 * Reviews stay off — they cost per row and nothing here reads them.
 *
 * Grubhub keeps the generic `{search, location, maxItems}` shape until an
 * actor is chosen for it.
 */
const DEFAULT_SEARCH_INPUT: Record<PlatformSlug, string> = {
  // dz_omar/doordash-scraper takes URLs, not a query field: discovery is a
  // /search/store/<q> page. `:uri` percent-encodes the term into the path.
  doordash:
    '{"startUrls":[{"url":"https://www.doordash.com/search/store/{{query:uri}}?event_type=search"}],"address":"{{address}}","maxResults":"{{limit}}","includeMenu":true,"fetchReviews":false}',
  ubereats:
    '{"query":"{{query}}","address":"{{address}}","latitude":"{{lat}}","longitude":"{{lng}}","addressCountry":"US","locale":"en-US","diningMode":"DELIVERY","storeType":"RESTAURANTS","maxRows":"{{limit}}","getMenuCustomizations":false}',
  grubhub: '{"search":"{{query}}","location":"{{address}}","maxItems":"{{limit}}"}',
};

const DEFAULT_STORE_INPUT: Record<PlatformSlug, string> = {
  doordash: '{"startUrls":[{"url":"{{storeUrl}}"}],"address":"{{address}}","includeMenu":true,"fetchReviews":false}',
  ubereats: '{"urls":["{{storeUrl}}"],"locale":"en-US","diningMode":"DELIVERY","getMenuCustomizations":false}',
  grubhub: '{"startUrls":[{"url":"{{storeUrl}}"}],"location":"{{address}}","maxItems":1}',
};

const envKey = (platform: PlatformSlug, suffix: string): string => `APIFY_${platform.toUpperCase()}_${suffix}`;

/** Read one platform's actor configuration, or throw with the exact env var to set. */
export function actorConfig(platform: PlatformSlug, env: NodeJS.ProcessEnv = process.env): ActorConfig {
  const searchActor = env[envKey(platform, 'ACTOR')]?.trim();
  if (!searchActor) {
    throw new Error(
      `${platform}: ${envKey(platform, 'ACTOR')} is not set. Pick a ${platform} actor on https://apify.com/store ` +
        `and put its id (the "username/actor-name" from the store URL) in .env.`,
    );
  }
  const storeActor = env[envKey(platform, 'STORE_ACTOR')]?.trim() || searchActor;
  return {
    searchActor,
    storeActor,
    searchInput: parseTemplate(env[envKey(platform, 'INPUT')] ?? DEFAULT_SEARCH_INPUT[platform], envKey(platform, 'INPUT')),
    storeInput: parseTemplate(env[envKey(platform, 'STORE_INPUT')] ?? DEFAULT_STORE_INPUT[platform], envKey(platform, 'STORE_INPUT')),
  };
}

/** Which platforms have an actor configured (used to fail fast on startup). */
export function configuredPlatforms(platforms: PlatformSlug[], env: NodeJS.ProcessEnv = process.env): PlatformSlug[] {
  return platforms.filter((p) => !!env[envKey(p, 'ACTOR')]?.trim());
}

function parseTemplate(raw: string, name: string): JsonObject {
  const parsed = safeJson(raw);
  if (!isObject(parsed)) throw new Error(`${name} must be a JSON object (got: ${raw.slice(0, 80)})`);
  return parsed;
}

/**
 * Substitute `{{placeholders}}` throughout the template.
 *
 * A string that is exactly one placeholder takes the value's own type, so
 * `"maxItems": "{{limit}}"` becomes a number; placeholders inside a longer
 * string interpolate as text. Keys whose value resolves to undefined (or to an
 * object/array that ends up empty) are dropped.
 */
export function renderInput(template: JsonObject, vars: TemplateVars): JsonObject {
  const render = (node: Json): Json | undefined => {
    if (typeof node === 'string') return renderString(node, vars);
    if (Array.isArray(node)) {
      const items = node.map(render).filter((v): v is Json => v !== undefined);
      return items.length ? items : undefined;
    }
    if (isObject(node)) {
      const out: JsonObject = {};
      for (const [k, v] of Object.entries(node)) {
        const r = render(v);
        if (r !== undefined) out[k] = r;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return node;
  };
  const rendered = render(template);
  return isObject(rendered) ? rendered : {};
}

/** `{{query}}` or `{{query:uri}}` — the `:uri` modifier percent-encodes, for placeholders inside a URL. */
const PLACEHOLDER = /\{\{\s*(\w+)(?::(\w+))?\s*\}\}/g;

function renderString(s: string, vars: TemplateVars): Json | undefined {
  const whole = s.match(/^\{\{\s*(\w+)(?::(\w+))?\s*\}\}$/);
  if (whole) {
    const v = vars[whole[1] as keyof TemplateVars];
    if (v === undefined || v === '') return undefined;
    // A lone placeholder keeps the value's own type, so "{{limit}}" is a number.
    return whole[2] === 'uri' ? encodeURIComponent(String(v)) : (v as Json);
  }
  PLACEHOLDER.lastIndex = 0;
  if (!PLACEHOLDER.test(s)) return s;
  PLACEHOLDER.lastIndex = 0;
  let missing = false;
  const out = s.replace(PLACEHOLDER, (_m, key: string, modifier: string | undefined) => {
    const v = vars[key as keyof TemplateVars];
    if (v === undefined || v === '') {
      missing = true;
      return '';
    }
    return modifier === 'uri' ? encodeURIComponent(String(v)) : String(v);
  });
  return missing ? undefined : out;
}
