/**
 * WPRDC "Geocoded Food Facilities" (Allegheny County open data, CKAN) ->
 * `foodFacilities`, plus promotion of the genuinely restaurant-like subset into
 * `restaurants` so the API serves real Pittsburgh places, not just the 46
 * curated demo rows.
 *
 * Run from the ingest CLI (`npm run ingest`), which connects to Mongo first.
 */
import type { Model } from 'mongoose';
import { FoodFacilityModel, RestaurantModel } from '../models';
import { slugify, unit } from '../seed/data';
import { WPRDC, bulkUpsert, ckanPages, ckanTotal, date, done, num, s, tick } from './common';

/**
 * `status` is an undocumented code (0,1,2,3,6,7,9). '1' is the only value that
 * means "currently permitted": every '1' row has an empty bus_cl_date and a
 * live placard, while '7' is the historical/closed pile (half of it carries a
 * close date). Verified against known-open spots (Mineo's, Noodlehead, ...).
 */
const OPEN = '1';

/**
 * Category codes that are a place the public can actually order food from.
 * The county publishes 66 codes; everything omitted here is a school kitchen,
 * hospital, nursing/boarding home, day care, commissary, warehouse, food
 * processor, vending/prepackaged retail, banquet hall, firehall, farmers
 * market, members-only club or a one-off temporary permit.
 */
const EATING_PLACE = new Set([
  '100', // Caterer
  '111', // Supermarket          -- prepared-food counters
  '112', // Chain Supermarket    --   "
  '117', // Bakery
  '118', // Chain Bakery
  '123', // Mobile - Tier II (Prepared Foods) -- food trucks
  '201', // Restaurant with Liquor
  '202', // Chain Restaurant with Liquor
  '211', // Restaurant without Liquor
  '212', // Chain Restaurant without Liquor
]);

/** Only the unambiguous ones; osm.ts does the real cuisine enrichment. */
const NAME_CUISINE: [RegExp, string][] = [
  [/\bpizz(a|eria)/i, 'Pizza'],
  [/\bsushi\b/i, 'Sushi'],
  [/\btaqueria\b|\btacos?\b/i, 'Mexican'],
  [/\bbakery\b|\bbake\s?shop\b/i, 'Bakery'],
  [/\bdeli\b|\bdelicatessen\b/i, 'Deli'],
  [/\bcoffee\b|\bespresso\b/i, 'Coffee'],
  [/\bice cream\b|\bcreamery\b/i, 'Ice Cream'],
  [/\bbbq\b|\bbarbe?cue\b/i, 'BBQ'],
  [/\bdo(ugh)?nuts?\b/i, 'Donuts'],
];

/** WPRDC x/y are lng/lat. Blank, 0 and out-of-region rows get no geo at all. */
function point(x: unknown, y: unknown): { lat: number; lng: number } | undefined {
  const lng = num(x);
  const lat = num(y);
  if (lng === undefined || lat === undefined) return undefined;
  if (lat < 39.5 || lat > 41.5 || lng < -81 || lng > -79) return undefined;
  return { lat, lng };
}

/** Bigger rooms skew pricier. County medians are ~45 seats / ~1,500 sq ft. */
function priceTier(slug: string, seats?: number, sqFeet?: number): 1 | 2 | 3 {
  if (seats) return seats >= 100 ? 3 : seats >= 40 ? 2 : 1;
  if (sqFeet) return sqFeet >= 4000 ? 3 : sqFeet >= 1500 ? 2 : 1;
  return (Math.floor(unit(`tier:${slug}`) * 3) + 1) as 1 | 2 | 3;
}

/** bulkUpsert takes a deliberately loose Model type; concrete models need a cast. */
const loose = (m: unknown): Model<Record<string, unknown>> => m as Model<Record<string, unknown>>;

/** Drop undefined keys so an absent CKAN cell never writes a null. */
const defined = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function ingestFacilities(opts: { promote?: boolean } = {}): Promise<{
  facilities: number;
  promoted: number;
}> {
  const promote = opts.promote !== false;
  const total = await ckanTotal(WPRDC.facilities);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facOps: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restOps: any[] = [];
  const skipped = new Map<string, number>();
  const skip = (why: string): void => void skipped.set(why, (skipped.get(why) ?? 0) + 1);

  let seen = 0;
  for await (const page of ckanPages(WPRDC.facilities)) {
    for (const row of page) {
      const facilityId = s(row.id);
      const name = s(row.facility_name);
      const categoryCode = s(row.category_cd);
      const categoryDesc = s(row.description) ?? 'uncategorised';
      const status = s(row.status);
      const geo = point(row.x, row.y);
      const zip = s(row.zip);
      const seatCount = num(row.seat_count);
      const sqFeet = num(row.sq_feet);
      const street = s(row.street);
      const full = [s(row.num), street].filter(Boolean).join(' ') || undefined;
      const address = defined({
        num: s(row.num),
        street,
        full,
        city: s(row.city),
        state: s(row.state),
        zip,
        municipality: s(row.municipal),
      });

      if (!facilityId || !name) {
        skip(`no facility id or name | ${categoryDesc}`);
        continue;
      }

      facOps.push({
        updateOne: {
          filter: { _id: `fac:${row._id}` },
          update: {
            $set: defined({
              facilityId,
              name,
              address,
              categoryCode,
              categoryDesc,
              permitCode: s(row.p_code),
              seatCount,
              sqFeet,
              noRoom: s(row.noroom),
              status,
              placardStatus: s(row.placard_st),
              businessStartDate: date(row.bus_st_date),
              businessCloseDate: date(row.bus_cl_date),
              source: 'wprdc',
              geo: geo ? { type: 'Point', coordinates: [geo.lng, geo.lat] } : undefined,
            }),
          },
          upsert: true,
        },
      });

      if (!promote) continue;
      if (status !== OPEN) {
        skip(`closed or not currently permitted | ${categoryDesc}`);
        continue;
      }
      if (!categoryCode || !EATING_PLACE.has(categoryCode)) {
        skip(`not a public eating place | ${categoryDesc}`);
        continue;
      }
      if (!geo) {
        skip(`no usable geocode | ${categoryDesc}`);
        continue;
      }
      if (!zip) {
        skip(`no zip | ${categoryDesc}`);
        continue;
      }

      // Facility id keeps the slug unique against the curated seed slugs.
      const slug = `${slugify(name)}-${facilityId}`;
      const cuisine = NAME_CUISINE.filter(([re]) => re.test(name)).map(([, c]) => c);
      // Everything here is a deterministic guess off the slug, not observed.
      const derivedFields = ['rating', 'ratingCount', 'priceTier', 'sampleItem', 'imageUrl'];
      if (cuisine.length > 0) derivedFields.push('cuisine');

      restOps.push({
        updateOne: {
          // Seed rows carry no facilityId, so this can never match one of them.
          filter: { facilityId },
          update: {
            $set: defined({
              facilityId,
              source: 'wprdc',
              name,
              address: full ?? name,
              location: { zip, geo: { lat: geo.lat, lng: geo.lng } },
              neighborhood: s(row.municipal), // county wards look like "Pittsburgh-102"
              seatCount,
              sqFeet,
            }),
            // Derived on first insert only, so a re-run never churns them and
            // osm.ts / menus.ts enrichment survives.
            $setOnInsert: {
              slug,
              cuisine,
              rating: +(3.2 + unit(`rating:${slug}`) * 1.7).toFixed(1),
              ratingCount: 20 + Math.floor(unit(`ratings:${slug}`) * 1181),
              priceTier: priceTier(slug, seatCount, sqFeet),
              sampleItem: {
                name: 'House specialty',
                menuPrice: +(8 + unit(`price:${slug}`) * 20).toFixed(2),
              },
              imageUrl: `https://picsum.photos/seed/${slug}/640/400`,
              derivedFields,
            },
          },
          upsert: true,
        },
      });
    }
    seen += page.length;
    tick('facilities', seen, total);
  }

  const facWritten = await bulkUpsert(loose(FoodFacilityModel), facOps, 'facilities');
  done('facilities', `${facOps.length.toLocaleString()} rows (${facWritten.toLocaleString()} changed)`);

  if (!promote) return { facilities: facOps.length, promoted: 0 };

  const restWritten = await bulkUpsert(loose(RestaurantModel), restOps, 'promote');
  done('promote', `${restOps.length.toLocaleString()} restaurants (${restWritten.toLocaleString()} changed)`);

  // Never drop silently: every excluded row is accounted for, by reason+category.
  const dropped = [...skipped.values()].reduce((a, b) => a + b, 0);
  console.log(`[promote] excluded ${dropped.toLocaleString()} of ${facOps.length.toLocaleString()} facilities:`);
  for (const [why, n] of [...skipped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${why}`);
  }

  return { facilities: facOps.length, promoted: restOps.length };
}
