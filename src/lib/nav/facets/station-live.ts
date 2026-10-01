import 'server-only';

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets, type FacetDimension } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { STATION_FEED_ACTIVITY_TYPES, STATION_FEED_OPS_EVENT_TYPES } from '@/lib/station-feed/event-map';
import { parseStationFeedQuery } from '@/lib/station-feed/query.server';
import {
  STATION_FEED_JOBS,
  STATION_FEED_OUTCOMES,
  type StationFeedJob,
  type StationFeedOutcome,
} from '@/lib/station-feed/types';
import type { OrgId } from '@/lib/tenancy/constants';

interface StationLiveFacetRow {
  job: StationFeedJob;
  outcome: StationFeedOutcome;
  n: number;
}

const JOB_LABEL: Record<StationFeedJob, string> = {
  identify: 'Identify',
  arrival: 'Arrival',
  unbox: 'Unbox',
  pick: 'Picker',
  quality_control: 'Quality Control',
  pack: 'Packing',
  scan_out: 'Scan out',
};

const OUTCOME_LABEL: Record<StationFeedOutcome, string> = {
  identified: 'Identified',
  committed: 'Committed',
  needs_attention: 'Needs attention',
};

function selected(csv: string, value: string): boolean {
  return csv.split(',').map((part) => part.trim()).includes(value);
}

const dimensions: ReadonlyArray<FacetDimension<StationLiveFacetRow>> = [
  {
    groupId: 'job',
    label: NAV_FACET_GROUPS['stations-live'][0].label,
    param: 'job',
    options: STATION_FEED_JOBS.map((value) => ({ value, label: JOB_LABEL[value] })),
    matches: (row, value) => selected(value, row.job),
  },
  {
    groupId: 'outcome',
    label: NAV_FACET_GROUPS['stations-live'][1].label,
    param: 'outcome',
    options: STATION_FEED_OUTCOMES.map((value) => ({ value, label: OUTCOME_LABEL[value] })),
    matches: (row, value) => selected(value, row.outcome),
  },
];

/** Counts over the same durable, phone-origin union as `/api/stations/live`. */
export async function stationLiveFacets(
  orgId: OrgId,
  params: Pick<URLSearchParams, 'get'>,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  const query = parseStationFeedQuery(params);
  const bind: unknown[] = [orgId, [...STATION_FEED_ACTIVITY_TYPES], [...STATION_FEED_OPS_EVENT_TYPES]];
  const where: string[] = [];
  if (query.staffIds.length > 0) {
    bind.push(query.staffIds);
    where.push(`staff_id = ANY($${bind.length}::int[])`);
  }
  if (query.from) {
    bind.push(query.from);
    where.push(`created_at >= $${bind.length}::timestamptz`);
  }
  if (query.to) {
    bind.push(query.to);
    where.push(`created_at < $${bind.length}::timestamptz`);
  }
  const narrowed = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await run(
    `WITH feed AS (
       SELECT CASE sal.activity_type
                WHEN 'ARRIVAL_SCANNED' THEN 'arrival'
                WHEN 'UNBOX_COMPLETED' THEN 'unbox'
                WHEN 'PICK_SCANNED' THEN 'pick'
                WHEN 'SERIAL_ADDED' THEN 'pick'
                WHEN 'QC_RESULT_RECORDED' THEN 'quality_control'
                WHEN 'PACK_COMPLETED' THEN 'pack'
                WHEN 'PACK_SCAN' THEN 'pack'
                WHEN 'SHIP_CONFIRM' THEN 'scan_out'
                WHEN 'PACK_SHIPPED' THEN 'scan_out'
              END AS job,
              CASE WHEN COALESCE(sal.metadata->>'outcome', '') = 'needs_attention'
                         OR (sal.activity_type = 'QC_RESULT_RECORDED' AND sal.metadata->>'passed' = 'false')
                   THEN 'needs_attention' ELSE 'committed' END AS outcome,
              sal.staff_id, sal.created_at
         FROM station_activity_logs sal
        WHERE sal.organization_id = $1
          AND sal.activity_type = ANY($2::text[])
          AND sal.metadata->>'origin' = 'phone'
       UNION ALL
       SELECT CASE oe.event_type
                WHEN 'receiving.carton.arrived' THEN 'arrival'
                WHEN 'UNBOX_CONFIRMED' THEN 'unbox'
              END AS job,
              'committed' AS outcome,
              oe.actor_staff_id AS staff_id, oe.occurred_at AS created_at
         FROM ops_events oe
        WHERE oe.organization_id = $1
          AND oe.event_type = ANY($3::text[])
          AND oe.payload->>'origin' = 'phone'
       UNION ALL
       SELECT 'identify' AS job,
              CASE WHEN mse.match_outcome = 'single' THEN 'identified' ELSE 'needs_attention' END AS outcome,
              mse.staff_id, mse.created_at
         FROM mobile_scan_events mse
        WHERE mse.organization_id = $1
          AND NOT EXISTS (
            SELECT 1
              FROM station_activity_logs committed
             WHERE committed.organization_id = mse.organization_id
               AND committed.metadata->>'origin' = 'phone'
               AND committed.metadata->>'mobile_scan_event_id' = mse.id::text
          )
          AND NOT EXISTS (
            SELECT 1
              FROM ops_events committed_ops
             WHERE committed_ops.organization_id = mse.organization_id
               AND committed_ops.payload->>'origin' = 'phone'
               AND committed_ops.payload->>'mobile_scan_event_id' = mse.id::text
          )
     )
     SELECT job, outcome, COUNT(*)::int AS n
       FROM feed
       ${narrowed}
      GROUP BY job, outcome`,
    bind,
  );

  const combos: StationLiveFacetRow[] = rows.map((row) => ({
    job: String(row.job) as StationFeedJob,
    outcome: String(row.outcome) as StationFeedOutcome,
    n: Number(row.n) || 0,
  }));
  const { total, groups } = computeFacets(combos, dimensions, {
    job: query.jobs.length > 0 ? query.jobs.join(',') : null,
    outcome: query.outcomes.length > 0 ? query.outcomes.join(',') : null,
  });
  return { context: 'stations-live', total, groups };
}
