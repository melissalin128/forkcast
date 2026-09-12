/**
 * Ingests every Allegheny County food-facility inspection (2014-present) from
 * the WPRDC CKAN datastore into `inspections`, then stamps each open-data
 * Restaurant with its most recent placard.
 *
 * Open data over a documented public API (data.wprdc.org). Run via the ingest
 * CLI, which owns connect(); this module only needs an open mongoose connection.
 */
import { InspectionModel, RestaurantModel } from '../models';
import { WPRDC, bulkUpsert, ckanPages, ckanTotal, date, done, num, s, tick } from './common';

/** bulkUpsert() takes a deliberately loose Model; concrete typed models need a cast through it. */
const loose = (m: unknown): Parameters<typeof bulkUpsert>[0] => m as Parameters<typeof bulkUpsert>[0];

export async function ingestInspections(): Promise<{ inspections: number; linked: number }> {
  const total = await ckanTotal(WPRDC.inspections);
  let seen = 0;
  let inspections = 0;

  // Write each page as it lands — 124k rows do not belong in a single array.
  for await (const rows of ckanPages(WPRDC.inspections)) {
    const ops: Record<string, unknown>[] = [];
    for (const r of rows) {
      const rowId = num(r._id);
      const facilityId = s(r.id);
      if (rowId === undefined || !facilityId) continue; // no stable key / no facility to hang it off
      ops.push({
        updateOne: {
          filter: { _id: `insp:${rowId}` },
          update: {
            $set: {
              encounter: s(r.encounter),
              facilityId,
              facilityName: s(r.facility_name),
              placardStatus: s(r.placard_st),
              placardDesc: s(r.placard_desc),
              categoryCode: s(r.category_cd),
              categoryDesc: s(r.description),
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
              purpose: s(r.purpose),
              purposeAbbr: s(r.abrv),
              reinspectCode: s(r.reispt_cd),
              reinspectDate: date(r.reispt_dt),
              source: 'wprdc',
            },
          },
          upsert: true,
        },
      });
    }
    inspections += await bulkUpsert(loose(InspectionModel), ops, 'inspections');
    seen += rows.length;
    tick('inspections', seen, total); // bulkUpsert ticks per chunk; restate the real total
  }
  done('inspections', `${seen.toLocaleString()} rows (${inspections.toLocaleString()} written)`);

  // Latest inspection per facility in one pass — rides the (facilityId, inspectedAt) index.
  const latest = await InspectionModel.aggregate<{ _id: string; placardDesc?: string; inspectedAt?: Date }>([
    { $match: { inspectedAt: { $type: 'date' } } },
    { $sort: { facilityId: 1, inspectedAt: -1 } },
    { $group: { _id: '$facilityId', placardDesc: { $first: '$placardDesc' }, inspectedAt: { $first: '$inspectedAt' } } },
  ]);

  // Only restaurants promoted from open data have a facilityId; the rest keep lastInspection empty.
  const known = new Set<string>(await RestaurantModel.distinct('facilityId', { facilityId: { $type: 'string' } }));
  const linkOps = latest
    .filter((l) => known.has(l._id))
    .map((l) => ({
      updateOne: {
        filter: { facilityId: l._id },
        // Field-level $set so wprdcViolations.ts keeps ownership of lastInspection.violationCount.
        update: { $set: { 'lastInspection.placardDesc': l.placardDesc, 'lastInspection.inspectedAt': l.inspectedAt } },
      },
    }));

  await bulkUpsert(loose(RestaurantModel), linkOps, 'inspections:link');
  done('inspections:link', `${linkOps.length.toLocaleString()} restaurants linked`);

  return { inspections, linked: linkOps.length };
}
