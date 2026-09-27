/** Query-string parser for GET /api/receiving-lines (and its testing twin at GET /api/testing/receiving-lines). */
import { z } from 'zod';
import {
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import { parseReceivingView, RECEIVING_VIEWS } from '@/lib/receiving/receiving-views';
import { RECEIVING_HISTORY_LIMIT } from '@/lib/receiving/receiving-modes';
import { parseTrackingInParam, TRACKING_IN_PARAM } from '@/lib/receiving/tracking-paste';
import { parseRefInParam, REF_IN_PARAM } from '@/lib/receiving/reconcile';

/**
 * Filter vocabularies shared by the GET filters (build-sql) and the POST/PATCH
 * body validation in the route. Moved here unchanged from the route module.
 */
export const QA_STATUSES  = new Set(['PENDING', 'PASSED', 'FAILED_DAMAGED', 'FAILED_INCOMPLETE', 'FAILED_FUNCTIONAL', 'HOLD']);
export const DISPOSITIONS = new Set(['ACCEPT', 'HOLD', 'RTV', 'SCRAP', 'REWORK']);
export const WORKFLOW_STATUSES = new Set([
  'EXPECTED', 'ARRIVED', 'MATCHED', 'UNBOXED', 'AWAITING_TEST',
  'IN_TEST', 'PASSED', 'FAILED', 'RTV', 'SCRAP', 'DONE',
]);

/** Raw `Number(...)` results are preserved as-is (including `NaN` for absent / malformed values) so downstream `Number.isFinite(x) && x >… */
const numberish = z.union([z.number(), z.nan()]);

export const receivingLinesQuerySchema = z.object({
  /** `?id=` — raw `Number(searchParams.get('id'))`; absent → 0, junk → NaN. */
  id: numberish,
  /** `?receiving_id=` — same raw-Number semantics as `id`. */
  receivingId: numberish,
  /** `?receiving_id_in=1,2,3` — restrict the list to an explicit carton set. */
  receivingIdIn: z.array(z.number()),
  /** `?limit=` — `Math.min(Number(v || 200), 500)`; junk → NaN (preserved). */
  limit: numberish,
  /** `?offset=` — `Math.max(Number(v || 0), 0)`; junk → NaN (preserved). */
  offset: numberish,
  search: z.string(),
  searchField: z.enum(['all', 'po', 'tracking', 'sku', 'product', 'serial']),
  searchScope: z.enum(['all', 'zoho_po', 'unmatched']),
  /** Trimmed + uppercased; validity (QA_STATUSES.has) is checked at SQL build. */
  qaFilter: z.string(),
  dispFilter: z.string(),
  workflowFilter: z.string(),
  /** Trimmed + lowercased raw `?view=` (drives the surface-isolation guards). */
  viewRaw: z.string(),
  /** Parsed view — `null` = no/unknown view → org-wide default scoping. */
  view: z.enum(RECEIVING_VIEWS).nullable(),
  deliveryStateFilter: z.string(),
  /** ISO `YYYY-MM-DD` or `''` — malformed silently no-ops (bookmark-safe). */
  poFrom: z.string(),
  poTo: z.string(),
  sortRaw: z.string(),
  incomingSort: z.enum(['zoho_newest', 'zoho_oldest', 'expected_soonest', 'recently_added', 'urgency']),
  historySort: z.enum(['scanned_newest', 'scanned_oldest', 'unboxed_newest', 'received_newest', 'unbox_activity']),
  wantsPrioritySort: z.boolean(),
  /** `?zohoStatus=open` — the "Hide Zoho-received" toggle. */
  hideZohoReceived: z.boolean(),
  /** `?tester=` — raw Number; absent → 0, junk → NaN. */
  testerId: numberish,
  /** Testing queue partition: forward intake, returns, or both. */
  returnScope: z.enum(['all', 'standard', 'returns']),
  /**
   * Testing Urgent tab — only cartons with explicit priority
   * (`is_priority` or a manual `priority_tier`).
   */
  priorityOnly: z.boolean(),
  /** `view=testing` verdict-time bounds; ISO `YYYY-MM-DD` or empty. */
  weekStart: z.string(),
  weekEnd: z.string(),
  includeSerials: z.boolean(),
  /** `?phase=` fetch tier — `spine` is the fast-paint tier: */
  phase: z.enum(['full', 'spine']),
  /** Universal-Incoming facet params (trimmed + lowercased raw strings). */
  inboundSourceParam: z.string(),
  incomingLinkParam: z.string(),
  /**
   * `?inkind=` — Incoming intake kind filter: `purchase` | `return`.
   * Empty = all. Invalid values degrade to empty.
   */
  inboundKindParam: z.enum(['', 'purchase', 'return']),
  /** `?staff=` — raw trimmed string + its raw Number twin. */
  staffFilterRaw: z.string(),
  staffFilterId: numberish,
  /**
   * Unbox Queue readiness (`?ustage=`): `staged` = shelf+lane, `unstaged` =
   * missing either. Empty = all. Invalid values degrade to empty.
   */
  unboxQueueStage: z.enum(['', 'staged', 'unstaged']),
  /**
   * Unbox Queue priority lane (`?ulane=`). Empty = all. Invalid → empty.
   */
  unboxQueueLane: z.enum(['', 'PO_STOCKOUT', 'PO_STANDARD', 'RETURN', 'HOLD']),
  /** `?tracking_in=` — canonical (upper-alnum) tracking keys from a bulk paste. */
  trackingIn: z.array(z.string()),
  /** `?ref_in=` — canonical keys of a pasted order / tracking list; `view=reconcile` matches them. */
  refIn: z.array(z.string()),
});

export type ReceivingLinesQuery = z.infer<typeof receivingLinesQuerySchema>;

/**
 * searchParams → typed {@link ReceivingLinesQuery}. Pure; never throws for any
 * URLSearchParams input (the schema is validated against the exact coercions
 * below, which always produce a conforming shape).
 */
export function parseReceivingLinesQuery(searchParams: URLSearchParams): ReceivingLinesQuery {
  const id          = Number(searchParams.get('id'));
  const receivingId = Number(searchParams.get('receiving_id'));
  // View is parsed BEFORE limit: the activity cap depends on it (below).
  const viewRaw = String(searchParams.get('view') || '').trim().toLowerCase();
  // Capped at the list's own ceiling — this names a page, never a bulk export.
  const receivingIdIn = Array.from(
    new Set(
      String(searchParams.get('receiving_id_in') || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).slice(0, 500);
  // view=activity is History — the ENTIRE timeline (operator 2026-09-14),
  // fetched in one long scroll; every other view stays a funnel page at the
  // 500 ceiling. RECEIVING_HISTORY_LIMIT keeps client and server in step.
  const limitCap = viewRaw === 'activity' ? RECEIVING_HISTORY_LIMIT : 500;
  const limit       = Math.min(Number(searchParams.get('limit') || 200), limitCap);
  const offset      = Math.max(Number(searchParams.get('offset') || 0), 0);
  const search      = String(searchParams.get('search') || '').trim();
  const searchField = normalizeReceivingHistorySearchField(searchParams.get('search_field'));
  const searchScope = normalizeReceivingHistorySearchScope(searchParams.get('search_scope'));
  const qaFilter    = String(searchParams.get('qa_status') || '').trim().toUpperCase();
  const dispFilter  = String(searchParams.get('disposition') || '').trim().toUpperCase();
  const workflowFilter = String(searchParams.get('workflow_status') || '').trim().toUpperCase();
  // Wave-2 dead-arm removal:
  const deliveryStateFilter = String(searchParams.get('delivery_state') || '')
    .trim()
    .toUpperCase();
  // Incoming-only: optional PO purchase-date range. ISO YYYY-MM-DD;
  // anything malformed silently no-ops so bookmarks survive.
  const isISODate = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [year, month, day] = s.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };
  const poFromRaw = String(searchParams.get('po_from') || '').trim();
  const poToRaw = String(searchParams.get('po_to') || '').trim();
  const poFrom = isISODate(poFromRaw) ? poFromRaw : '';
  const poTo = isISODate(poToRaw) ? poToRaw : '';
  // Incoming-only:
  const sortRaw = String(searchParams.get('sort') || '').trim().toLowerCase();
  const incomingSort:
    | 'zoho_newest'
    | 'zoho_oldest'
    | 'expected_soonest'
    | 'recently_added'
    | 'urgency' =
    sortRaw === 'zoho_oldest' || sortRaw === 'po_oldest'
      ? 'zoho_oldest'
      : sortRaw === 'expected_soonest'
        ? 'expected_soonest'
        : sortRaw === 'recently_added'
          ? 'recently_added'
          : sortRaw === 'urgency'
            ? 'urgency'
            : 'zoho_newest';
  // Sort axis for the receiving-history feed (view=all/activity).
  const historySort:
    | 'scanned_newest'
    | 'scanned_oldest'
    | 'unboxed_newest'
    | 'received_newest'
    | 'unbox_activity' =
    sortRaw === 'scanned_oldest'
      ? 'scanned_oldest'
      : sortRaw === 'unboxed_newest'
        ? 'unboxed_newest'
        : sortRaw === 'received_newest'
          ? 'received_newest'
          : sortRaw === 'unbox_activity'
            ? 'unbox_activity'
            : 'scanned_newest';
  // Prioritize views (triage Prioritize tab + unbox Prioritize toggle) request
  // ?sort=priority — order by source-platform rank first, recency second.
  const wantsPrioritySort = sortRaw === 'priority';
  // Shared contract with the client (src/lib/receiving/receiving-views.ts) so
  // the supported view set can't drift between the two ends. `null` = no/
  // unknown view → org-wide default scoping.
  const view = parseReceivingView(viewRaw);
  // Phase 2 — physical-vs-financial decoupling:
  const zohoStatusRaw = String(searchParams.get('zohoStatus') || '').trim().toLowerCase();
  const inventoryStatusRaw = String(searchParams.get('inventoryStatus') || '').trim().toLowerCase();
  const hideZohoReceived = (inventoryStatusRaw || zohoStatusRaw) === 'open';
  // view=testing only: scope the recently-tested feed to one staff member.
  const testerId = Number(searchParams.get('tester'));
  const returnScopeRaw = String(searchParams.get('return_scope') || '').trim().toLowerCase();
  const returnScope =
    returnScopeRaw === 'returns'
      ? 'returns'
      : returnScopeRaw === 'standard'
        ? 'standard'
        : 'all';
  const priorityOnlyRaw = String(searchParams.get('priority_only') || '').trim().toLowerCase();
  const priorityOnly = priorityOnlyRaw === '1' || priorityOnlyRaw === 'true';
  // Testing History only: verdict-time week range. Camel-case names are the
  // shared station feed contract; the retired no-view snake-case fallback
  // (`week_start` / `week_end`) remains ignored.
  const weekStartRaw = String(searchParams.get('weekStart') || '').trim();
  const weekEndRaw = String(searchParams.get('weekEnd') || '').trim();
  const hasTestingWeek =
    isISODate(weekStartRaw) &&
    isISODate(weekEndRaw) &&
    weekStartRaw <= weekEndRaw;
  const weekStart = hasTestingWeek ? weekStartRaw : '';
  const weekEnd = hasTestingWeek ? weekEndRaw : '';
  const include     = String(searchParams.get('include') || '').trim().toLowerCase();
  // Spine tier (fast paint): `?phase=spine` wins over `include=serials` — the
  // projection column already rides along in the list SELECT, so the spine
  // response still shows serial chips without the authoritative resolve.
  const phaseRaw = String(searchParams.get('phase') || '').trim().toLowerCase();
  const phase: 'full' | 'spine' = phaseRaw === 'spine' ? 'spine' : 'full';
  const includeSerials =
    phase !== 'spine' && include.split(',').map((s) => s.trim()).includes('serials');
  // Universal Incoming facets (flag-gated, plan §6).
  const inboundSourceParam = String(searchParams.get('inbound') || '').trim().toLowerCase();
  const incomingLinkParam = String(searchParams.get('link') || '').trim().toLowerCase();
  const inkindRaw = String(searchParams.get('inkind') || '').trim().toLowerCase();
  const inboundKindParam =
    inkindRaw === 'purchase' || inkindRaw === 'return' ? inkindRaw : '';
  // Universal staff filter (P1-WORK-02): narrow the carton list to one staff —
  // who received, unboxed, or first-scanned it. Absent = ALL staff (default).
  const staffFilterRaw = String(searchParams.get('staff') || '').trim();
  const staffFilterId = Number(staffFilterRaw);

  // Unbox Queue staging filters (`?ustage=` / `?ulane=`). Invalid → empty so
  // deep links never 400; only `unbox_queue` buildParams emits these.
  const ustageRaw = String(searchParams.get('ustage') || '').trim().toLowerCase();
  const unboxQueueStage =
    ustageRaw === 'staged' || ustageRaw === 'unstaged' ? ustageRaw : '';
  // Bulk tracking paste (`?tracking_in=`). One parser for every paste in the
  // product — the ERP check and this filter split the same blob the same way.
  const trackingIn = parseTrackingInParam(searchParams.get(TRACKING_IN_PARAM)).keys;
  const refIn = parseRefInParam(searchParams.get(REF_IN_PARAM)).keys;

  const ulaneRaw = String(searchParams.get('ulane') || '').trim().toUpperCase();
  const unboxQueueLane =
    ulaneRaw === 'PO_STOCKOUT'
    || ulaneRaw === 'PO_STANDARD'
    || ulaneRaw === 'RETURN'
    || ulaneRaw === 'HOLD'
      ? (ulaneRaw as 'PO_STOCKOUT' | 'PO_STANDARD' | 'RETURN' | 'HOLD')
      : '';

  return receivingLinesQuerySchema.parse({
    id,
    receivingId,
    receivingIdIn,
    limit,
    offset,
    search,
    searchField,
    searchScope,
    qaFilter,
    dispFilter,
    workflowFilter,
    viewRaw,
    view,
    deliveryStateFilter,
    poFrom,
    poTo,
    sortRaw,
    incomingSort,
    historySort,
    wantsPrioritySort,
    hideZohoReceived,
    testerId,
    returnScope,
    priorityOnly,
    weekStart,
    weekEnd,
    includeSerials,
    phase,
    inboundSourceParam,
    incomingLinkParam,
    inboundKindParam,
    staffFilterRaw,
    staffFilterId,
    unboxQueueStage,
    unboxQueueLane,
    trackingIn,
    refIn,
  });
}
