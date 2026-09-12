/**
 * Live delivery quotes from the platforms' OFFICIAL partner APIs.
 *
 *   npm run ingest -- --only livequotes
 *
 * This is the supported way to get current platform pricing, and the reason
 * src/adapters is not used for bulk collection. Two documented APIs, both with
 * a free sandbox:
 *
 *   DoorDash Drive   POST /drive/v2/quotes                 (JWT, HS256 + DD-JWT-V1)
 *                    -> { fee, currency, pickup_time_estimated, dropoff_time_estimated }
 *   Uber Direct      POST /v1/eats/deliveries/estimates    (OAuth2 client_credentials,
 *                                                           scope eats.deliveries)
 *                    -> { delivery_fee: { total, line_items[DELIVERY_FEE|BUSY_AREA_FEE] }, etd }
 *
 * WHAT THIS IS NOT. Both endpoints quote the *logistics* fee for a delivery you
 * originate from a store you operate. Neither returns the consumer marketplace
 * checkout total at a restaurant you do not own — there is no official API for
 * that, on any platform. So these give Forkcast a real, current fee-and-ETA
 * anchor for Pittsburgh address pairs; they do not give per-restaurant menu
 * prices. Snapshots written here are tagged with their real source so they are
 * never confused with the modelled ones from snapshots.ts.
 *
 * Credentials live in the repo-root .env and are optional — with none set this
 * stage logs a skip and the rest of the ingest runs normally.
 *   DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, DOORDASH_SIGNING_SECRET
 *   UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_CUSTOMER_ID
 */
import { createHmac } from 'node:crypto';
import { PriceSnapshotModel, RestaurantModel } from '../models';
import { done, fetchJson, sleep, tick } from './common';

/** Real Pittsburgh dropoff points, so quotes reflect genuine city distances. */
const DROPOFFS = [
  { label: 'CMU',          address: '5000 Forbes Ave, Pittsburgh, PA 15213' },
  { label: 'Downtown',     address: '414 Grant St, Pittsburgh, PA 15219' },
  { label: 'Squirrel Hill',address: '5824 Forbes Ave, Pittsburgh, PA 15217' },
  { label: 'Lawrenceville',address: '3600 Butler St, Pittsburgh, PA 15201' },
] as const;

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** DoorDash Drive JWT: HS256 over a DD-JWT-V1 header, secret is base64url. */
function doordashJwt(devId: string, keyId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', 'dd-ver': 'DD-JWT-V1' })));
  const body = b64url(Buffer.from(JSON.stringify({ aud: 'doordash', iss: devId, kid: keyId, iat: now, exp: now + 300 })));
  const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return `${head}.${body}.${b64url(createHmac('sha256', key).update(`${head}.${body}`).digest())}`;
}

interface Quote {
  feeCents: number;
  etaMin: number;
}

async function doordashQuote(pickup: string, dropoff: string): Promise<Quote | null> {
  const { DOORDASH_DEVELOPER_ID: d, DOORDASH_KEY_ID: k, DOORDASH_SIGNING_SECRET: sec } = process.env;
  if (!d || !k || !sec) return null;
  const res = await fetchJson<{ fee: number; pickup_time_estimated: string; dropoff_time_estimated: string }>(
    'https://openapi.doordash.com/drive/v2/quotes',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${doordashJwt(d, k, sec)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        // external_delivery_id must be unique per quote
        external_delivery_id: `forkcast-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        pickup_address: pickup,
        dropoff_address: dropoff,
      }),
    },
    2,
  );
  const eta = Math.max(
    1,
    Math.round((new Date(res.dropoff_time_estimated).getTime() - Date.now()) / 60000),
  );
  return { feeCents: res.fee, etaMin: eta };
}

let uberToken: { value: string; expiresAt: number } | null = null;

async function uberBearer(): Promise<string | null> {
  const { UBER_CLIENT_ID: id, UBER_CLIENT_SECRET: sec } = process.env;
  if (!id || !sec) return null;
  if (uberToken && uberToken.expiresAt > Date.now() + 60_000) return uberToken.value;
  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    'https://auth.uber.com/oauth/v2/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id,
        client_secret: sec,
        grant_type: 'client_credentials',
        scope: 'eats.deliveries',
      }).toString(),
    },
    2,
  );
  uberToken = { value: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return uberToken.value;
}

async function uberQuote(storeId: string, dropoff: string): Promise<Quote | null> {
  const token = await uberBearer();
  if (!token) return null;
  const res = await fetchJson<{
    estimates: { delivery_fee: { total: number }; etd: number }[];
  }>(
    'https://api.uber.com/v1/eats/deliveries/estimates',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        pickup: { store_id: storeId },
        dropoff_address: dropoff,
        pickup_times: [Date.now()],
      }),
    },
    2,
  );
  const e = res.estimates?.[0];
  return e ? { feeCents: e.delivery_fee.total, etaMin: Math.max(1, Math.round(e.etd)) } : null;
}

/**
 * Quote `limit` restaurants against the Pittsburgh dropoff points and store the
 * results as PriceSnapshots tagged with their real source. Rate-limited on
 * purpose: these are partner APIs with quotas, not a firehose.
 */
export async function ingestLiveQuotes(opts: { limit?: number } = {}): Promise<{
  quoted: number;
  skipped: string[];
}> {
  const label = 'livequotes';
  const skipped: string[] = [];
  const hasDd = Boolean(process.env.DOORDASH_DEVELOPER_ID && process.env.DOORDASH_KEY_ID && process.env.DOORDASH_SIGNING_SECRET);
  const hasUber = Boolean(process.env.UBER_CLIENT_ID && process.env.UBER_CLIENT_SECRET);
  if (!hasDd) skipped.push('doordash (set DOORDASH_DEVELOPER_ID / DOORDASH_KEY_ID / DOORDASH_SIGNING_SECRET)');
  if (!hasUber) skipped.push('ubereats (set UBER_CLIENT_ID / UBER_CLIENT_SECRET)');
  if (!hasDd && !hasUber) {
    done(label, 'no partner API credentials set -> skipped. See docs/DATA_SOURCES.md for signup.');
    return { quoted: 0, skipped };
  }

  const limit = opts.limit ?? 50;
  const restaurants = await RestaurantModel.find({ source: 'wprdc' }).limit(limit).lean();
  const ops: Record<string, unknown>[] = [];
  let n = 0;

  for (const r of restaurants) {
    const dropoff = DROPOFFS[n % DROPOFFS.length];
    const capturedAt = new Date();
    for (const [slug, fn] of [
      ['doordash', () => doordashQuote(r.address, dropoff.address)],
      ['ubereats', () => uberQuote(r.platformIds?.ubereats ?? '', dropoff.address)],
    ] as const) {
      if (slug === 'ubereats' && !r.platformIds?.ubereats) continue; // Direct needs a real store_id
      try {
        const q = await fn();
        if (!q) continue;
        ops.push({
          updateOne: {
            filter: { restaurantId: r._id, platformSlug: slug, capturedAt },
            update: {
              $setOnInsert: {
                restaurantId: r._id,
                platformSlug: slug,
                // `total` on these rows is the logistics fee, NOT a checkout
                // total — the partner APIs cannot return one. `source` marks
                // them so repo.listSnapshots() keeps them out of total-vs-time.
                total: q.feeCents / 100,
                deliveryFee: q.feeCents / 100,
                etaMin: q.etaMin,
                promoApplied: false,
                capturedAt,
                source: slug === 'doordash' ? 'doordash-drive' : 'uber-direct',
              },
            },
            upsert: true,
          },
        });
      } catch (err) {
        // A single failed quote must not kill the run; partner APIs rate-limit.
        console.warn(`[${label}] ${slug} quote failed for ${r.name}: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(250); // stay well inside partner rate limits
    }
    n += 1;
    tick(label, n, restaurants.length);
  }

  if (ops.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (PriceSnapshotModel as any).bulkWrite(ops, { ordered: false });
  }
  done(label, `${ops.length} live quotes stored from ${restaurants.length} restaurants`);
  return { quoted: ops.length, skipped };
}
