/**
 * WPRDC inspection violations -> ViolationModel, then each promoted
 * Restaurant's last-inspection violation count. Allegheny County open data over the
 * public CKAN datastore API (~405k rows) — nothing here scrapes a delivery app.
 *
 * Run from the ingest CLI. Safe to re-run: every write is an upsert keyed on the
 * stable CKAN row id.
 */
import { RestaurantModel, ViolationModel } from '../models';
import { WPRDC, bulkUpsert, ckanPages, ckanTotal, date, done, s, tick } from './common';

export async function ingestViolations(): Promise<{ violations: number; linked: number }> {
  const total = await ckanTotal(WPRDC.violations);
  let seen = 0;
  let written = 0;

  // Write each page as it lands — 405k rows do not belong in a single array.
  for await (const rows of ckanPages(WPRDC.violations)) {
    const ops = rows
      .filter((r) => s(r.id)) // facilityId is required; a row without one is unusable
      .map((r) => ({
        updateOne: {
          filter: { _id: `viol:${String(r._id)}` },
          update: {
            $set: {
              encounter: s(r.encounter),
              facilityId: s(r.id), // 'id' here is the FACILITY id, not the violation's
              facilityName: s(r.facility_name),
              categoryDesc: s(r.description), // facility category, e.g. "Restaurant without Liquor"
              violation: s(r.description_new), // 'description_new' is the violation text
              violationNew: s(r.description_new),
              address: {
                num: s(r.num),
                street: s(r.street),
                city: s(r.city),
                state: s(r.state),
                zip: s(r.zip),
                municipality: s(r.municipal),
              },
              inspectedAt: date(r.inspect_dt),
              startTime: s(r.start_time),
              endTime: s(r.end_time),
              rating: s(r.rating),
              low: s(r.low),
              medium: s(r.medium),
              high: s(r.high),
              url: s(r.url),
              source: 'wprdc',
            },
          },
          upsert: true,
        },
      }));
    // `as never` only to get past bulkUpsert's loose model parameter type.
    written += await bulkUpsert(ViolationModel as never, ops, 'violations');
    seen += rows.length;
    tick('violations', seen, total); // bulkUpsert ticks per chunk; restate the real total
  }
  done('violations', `${seen.toLocaleString()} rows (${written.toLocaleString()} written)`);

  // The count belongs to `lastInspection`, so it is the violations written at
  // THAT inspection — an all-time total (some facilities have hundreds since
  // 2015) would read as one catastrophic visit. One grouped pass over the
  // violations, keyed on (facility, inspection date), beats a query per
  // restaurant. Runs after the inspections stage, which stamps inspectedAt; a
  // restaurant without one is left alone rather than stamped with a bogus 0.
  const counts = new Map<string, number>();
  const groups = await ViolationModel.aggregate<{ _id: { f: string; d: Date }; n: number }>([
    { $match: { inspectedAt: { $type: 'date' } } },
    { $group: { _id: { f: '$facilityId', d: '$inspectedAt' }, n: { $sum: 1 } } },
  ]);
  for (const g of groups) counts.set(`${g._id.f}|${g._id.d.toISOString()}`, g.n);

  const rests = await RestaurantModel.find(
    { facilityId: { $ne: null }, 'lastInspection.inspectedAt': { $type: 'date' } },
    { facilityId: 1, 'lastInspection.inspectedAt': 1 },
  ).lean<{ facilityId: string; lastInspection: { inspectedAt: Date } }[]>();
  const linkOps = rests.map((r) => ({
    updateOne: {
      filter: { facilityId: r.facilityId },
      update: {
        $set: {
          'lastInspection.violationCount':
            counts.get(`${r.facilityId}|${r.lastInspection.inspectedAt.toISOString()}`) ?? 0,
        },
      },
    },
  }));
  await bulkUpsert(RestaurantModel as never, linkOps, 'viol-link');
  done('viol-link', `${linkOps.length.toLocaleString()} restaurants carry a last-inspection violation count`);

  return { violations: seen, linked: linkOps.length };
}
