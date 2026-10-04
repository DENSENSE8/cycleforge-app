/**
 * Shipping (page `outbound`) facet counts. Every membership predicate is the
 * one the list and desk-counts already read — `sqlDeskQueueScope` (Allocate),
 * `sqlOrderDeskStage`, `sqlOrderAssignedToStaff`,
 * `sqlDeskRefinementClauses` (packedBy / pickerId / pickedBy / order date /
 * ship-by window), `sqlOrderTestDeadlineAt` (the list's ship-by) — so a
 * facet count is, by construction, the total the list shows for that pick.
 * (FBM › Exceptions is the Exceptions hub's: `src/lib/nav/facets/exceptions.ts`.)
 *
 * One statement per request: it returns one row per combination of facet
 * values with its count, and `computeFacets` does the rest in memory.
 *
 * Not reflected: the desk's free-text search. It lives in the in-memory desk
 * store (never the URL), so these counts describe the unsearched view; the
 * list's search itself stays in the view's scope (`strictSearchScope` on every
 * desk mount). The text's per-view counts are `GET /api/nav/locate`'s.
 */

import {
  computeFacets,
  type ActiveFacetFilters,
  type ComputedFacetGroup,
  type FacetDimension,
} from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS, type NavFacetContext } from '@/lib/nav/facets/contexts';
import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { readDeskRefinements, type DeskRefinements } from '@/lib/orders/desk-view-filters';
import {
  DESK_AGING_BUCKETS,
  DESK_STAGES,
  sqlDeskAgingBucket,
  sqlDeskQueueScope,
  sqlDeskRefinementClauses,
  sqlOrderAssignedToStaff,
  sqlOrderDeskStage,
  sqlOrderTestDeadlineAt,
  type DeskAgingBucket,
  type DeskQueueView,
  type DeskStage,
} from '@/lib/orders/desk-view-sql';

type ParamReader = Pick<URLSearchParams, 'get'>;

export interface FacetSqlRunner {
  (sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
}

// ── queue views: Allocate (triage) ──────────────────────────────────────────────

export interface QueueFacetCombo {
  stage: DeskStage;
  aging: DeskAgingBucket;
  urgent: boolean;
  blocked: boolean;
  n: number;
}

const STAGE_LABEL: Record<DeskStage, string> = { pending: 'Not picked', picked: 'Picked', packed: 'Packed · waiting' };
const AGING_LABEL: Record<DeskAgingBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Upcoming',
  unscheduled: 'No ship-by',
};

function groupDecl(context: NavFacetContext, id: string) {
  const decl = NAV_FACET_GROUPS[context].find((g) => g.id === id);
  // Every queue context filters on all five params the list honours; groups a
  // context does not DECLARE still narrow its total but are not returned.
  return decl ?? { id, label: id, param: id, multi: false };
}

function queueDimensions(context: NavFacetContext): FacetDimension<QueueFacetCombo>[] {
  const g = (id: string) => groupDecl(context, id);
  return [
    {
      groupId: 'stage', label: g('stage').label, param: g('stage').param,
      options: DESK_STAGES.map((value) => ({ value, label: STAGE_LABEL[value] })),
      matches: (row, value) => row.stage === value,
    },
    {
      groupId: 'aging', label: g('aging').label, param: g('aging').param,
      options: DESK_AGING_BUCKETS.map((value) => ({ value, label: AGING_LABEL[value] })),
      matches: (row, value) => row.aging === value,
    },
    {
      // Must ship = ship-by today or earlier (overdue ∪ today).
      groupId: 'late', label: g('late').label, param: g('late').param,
      options: [{ value: '1', label: 'Must ship' }],
      matches: (row, value) => value === '1' && (row.aging === 'overdue' || row.aging === 'today'),
    },
    {
      groupId: 'attention', label: g('attention').label, param: g('attention').param,
      options: [{ value: '1', label: 'Urgent' }],
      matches: (row, value) => value === '1' && row.urgent,
    },
    {
      groupId: 'ustatus', label: g('ustatus').label, param: g('ustatus').param,
      options: [{ value: 'BLOCKED', label: 'Out of stock' }],
      matches: (row, value) => value === 'BLOCKED' && row.blocked,
    },
  ];
}

function flag(raw: string | null): '1' | null {
  return raw === '1' || raw === 'true' ? '1' : null;
}

/** The list's own parsing of each facet param (UnshippedTable / `/api/orders`). */
export function readQueueFacetFilters(params: ParamReader): ActiveFacetFilters {
  const stage = String(params.get('stage') || '').toLowerCase();
  const aging = String(params.get('aging') || '').toLowerCase();
  return {
    stage: (DESK_STAGES as readonly string[]).includes(stage) ? stage : null,
    aging: (DESK_AGING_BUCKETS as readonly string[]).includes(aging) ? aging : null,
    late: flag(params.get('late')),
    attention: flag(params.get('attention')),
    ustatus: String(params.get('ustatus') || '').trim().toUpperCase() === 'BLOCKED' ? 'BLOCKED' : null,
  };
}

/** `?staff=` — positive integer, else all staff (the list's parse). */
export function readStaffFilter(params: ParamReader): number | null {
  const n = Number(params.get('staff'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One statement: facet-value combinations with their counts for a queue view. */
export function buildQueueFacetSql(
  view: DeskQueueView,
  orgId: string,
  staffId: number | null,
  refinements: DeskRefinements,
) {
  const params: unknown[] = [orgId];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const clauses: string[] = [];
  if (staffId != null) clauses.push(sqlOrderAssignedToStaff(bind(staffId)));
  clauses.push(...sqlDeskRefinementClauses(refinements, bind, 'o', 'dl.deadline_at'));
  const refineClause = clauses.map((c) => `AND ${c}`).join('\n          ');
  const sql = `
    SELECT f.stage, f.aging, f.urgent, f.blocked, COUNT(*)::int AS n
      FROM (
        SELECT
          CASE
            WHEN ${sqlOrderDeskStage('packed')} THEN 'packed'
            WHEN ${sqlOrderDeskStage('picked')} THEN 'picked'
            ELSE 'pending'
          END AS stage,
          ${sqlDeskAgingBucket('dl.deadline_at')} AS aging,
          COALESCE(o.is_urgent, false) AS urgent,
          COALESCE(o.is_out_of_stock, false) AS blocked
        FROM orders o
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        LEFT JOIN LATERAL (SELECT ${sqlOrderTestDeadlineAt('o')} AS deadline_at) dl ON TRUE
        WHERE o.organization_id = $1
          AND ${sqlDeskQueueScope(view)}
          ${refineClause}
      ) f
     GROUP BY 1, 2, 3, 4`;
  return { sql, params };
}

function toQueueCombo(row: Record<string, unknown>): QueueFacetCombo {
  return {
    stage: String(row.stage) as DeskStage,
    aging: String(row.aging) as DeskAgingBucket,
    urgent: row.urgent === true,
    blocked: row.blocked === true,
    n: Number(row.n) || 0,
  };
}

// ── entry ────────────────────────────────────────────────────────────────────

const QUEUE_VIEW: Partial<Record<NavFacetContext, DeskQueueView>> = {
  'outbound.triage': 'triage',
};

/** Keep only the groups the context declares, in its declared order. */
function declaredGroups(context: NavFacetContext, groups: readonly ComputedFacetGroup[]): ComputedFacetGroup[] {
  return NAV_FACET_GROUPS[context].flatMap((decl) => groups.filter((g) => g.id === decl.id));
}

export async function outboundFacets(
  context: NavFacetContext,
  orgId: string,
  params: ParamReader,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  const view = QUEUE_VIEW[context];
  if (!view) throw new Error(`no outbound facet source for ${context}`);
  const { sql, params: bind } = buildQueueFacetSql(view, orgId, readStaffFilter(params), readDeskRefinements(params));
  const rows = (await run(sql, bind)).map(toQueueCombo);
  const { total, groups } = computeFacets(rows, queueDimensions(context), readQueueFacetFilters(params));
  return { context, total, groups: declaredGroups(context, groups) };
}
