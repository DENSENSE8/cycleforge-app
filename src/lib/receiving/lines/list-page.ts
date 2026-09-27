/**
 * One page of the receiving-lines list feed — pre-limits, list + count,
 * serial hydration and the lineless-carton placeholder merges. `GET
 * /api/receiving-lines` / `GET /api/testing/receiving-lines` and the station
 * nav recents adapters (`receiving.*`, `testing.opened`) all read it, so a
 * rail and its sidebar recents list can never disagree on membership or order.
 */

import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  buildUnmatchedEmptyReceivingLine,
  normalizeRow,
  type NormalizedReceivingLine,
} from '@/lib/receiving/lines/normalize-row';
import { fetchSerialsForLines } from '@/lib/receiving/serial-projection';
import {
  isReceivingPhysicalStateFirst,
  isSerialProjectionDriftProbe,
  isUnboxRailColumnRead,
} from '@/lib/feature-flags';
import type { ReceivingLinesQuery } from '@/lib/receiving/lines/query';
import {
  buildReceivingLinesListSql,
  buildScannedCandidateSql,
  buildUnmatchedPlaceholdersSql,
  buildUnboxOpenedPlaceholdersSql,
  shouldIncludeUnmatchedPlaceholders,
  shouldIncludeUnboxOpenedPlaceholders,
} from '@/lib/receiving/lines/build-sql';

/** Flag-derived read switches every list read must agree on. */
export function resolveReceivingLinesReadFlags(query: ReceivingLinesQuery): {
  applyScannedZohoExclusion: boolean;
  unboxRailColumnRead: boolean;
} {
  return {
    // Phase 2 — physical-vs-financial decoupling.
    applyScannedZohoExclusion: !isReceivingPhysicalStateFirst() || query.hideZohoReceived,
    // Layer 1 (rail read-after-write): read view=unbox_opened membership from the
    // committed receiving_unbox.opened_at column only. Flag-gated, default off.
    unboxRailColumnRead: isUnboxRailColumnRead(),
  };
}

export interface ReceivingLinesPageInput {
  query: ReceivingLinesQuery;
  orgId: OrgId;
  /** The requesting operator (view=viewed / testing_opened are theirs); may be NaN. */
  viewerStaffId: number;
  universalIncoming: boolean;
  applyScannedZohoExclusion: boolean;
  unboxRailColumnRead: boolean;
}

export async function fetchReceivingLinesPage(
  input: ReceivingLinesPageInput,
): Promise<{ rows: NormalizedReceivingLine[]; total: number }> {
  const { orgId, viewerStaffId, universalIncoming, applyScannedZohoExclusion, unboxRailColumnRead } = input;
  let { query } = input;
  const { limit, offset, view, historySort, includeSerials } = query;

  // Pre-limit the Unbox recents rail before the display laterals run.
  query = await maybePreLimitUnboxOpened(query, orgId, offset);

  // Gate-before-decorate for `view=scanned` (the /triage rail's cold-load shape):
  const scannedLineIdIn = await maybePreLimitScannedLineIds(
    query,
    orgId,
    offset,
    applyScannedZohoExclusion,
    unboxRailColumnRead,
  );

  // Paginated list — all lines, optionally filtered.
  const built = buildReceivingLinesListSql({
    query,
    orgId,
    viewerStaffId,
    universalIncoming,
    applyScannedZohoExclusion,
    unboxRailColumnRead,
    ...(scannedLineIdIn ? { scannedLineIdIn } : {}),
  });
  const [rowsRes, countRes] = await withTenantConnection(orgId, (client) => Promise.all([
    client.query(built.list.sql, built.list.params),
    client.query(built.count.sql, built.count.params),
  ]));

  let normalizedList = rowsRes.rows.map(normalizeRow);
  let total = Number(countRes.rows[0]?.total ?? 0);
  if (includeSerials) {
    const serialsByLine = await fetchSerialsForLines(normalizedList.map((r) => r.id), orgId);
    // Free drift probe:
    if (isSerialProjectionDriftProbe()) {
      for (const row of normalizedList) {
        const projected = Array.isArray(row.serials)
          ? row.serials.map((s) => s.serial_number).sort()
          : null;
        // `undefined` means the SELECT omitted the column, which is not drift.
        if (projected == null) continue;
        const authoritative = (serialsByLine.get(row.id) ?? [])
          .map((s) => s.serial_number)
          .sort();
        if (JSON.stringify(projected) !== JSON.stringify(authoritative)) {
          console.warn('[serial-projection-drift]', {
            orgId,
            view,
            lineId: row.id,
            projected,
            authoritative,
          });
        }
      }
    }
    for (const row of normalizedList) {
      (row as Record<string, unknown>).serials = serialsByLine.get(row.id) ?? [];
    }
  }

  // Unmatched/unfound cartons live in the `receiving_carton` table with no `receiving_line` row yet, so they never come back from the main…
  if (shouldIncludeUnmatchedPlaceholders(query)) {
    const placeholders = buildUnmatchedPlaceholdersSql(query, orgId);
    const [unmatchedPkgsRes, unmatchedCntRes] = await withTenantConnection(orgId, (client) => Promise.all([
      client.query(placeholders.list.sql, placeholders.list.params),
      client.query(placeholders.count.sql, placeholders.count.params),
    ]));
    total += Number(unmatchedCntRes.rows[0]?.n ?? 0);
    const placeholderNorm = unmatchedPkgsRes.rows.map((pkg) =>
      normalizeRow(buildUnmatchedEmptyReceivingLine(pkg as Record<string, unknown>)),
    );
    for (const row of placeholderNorm) {
      if (includeSerials) (row as Record<string, unknown>).serials = [];
    }
    // Respect the requested sort axis after the placeholder merge — re-sorting everything by scan-based last_activity_at here let a mere door…
    normalizedList = [...normalizedList, ...placeholderNorm].sort((a, b) =>
      historySort === 'unboxed_newest'
        ? compareReceivingRowsByUnboxedAt(a, b)
        : historySort === 'unbox_activity'
          ? compareReceivingRowsByUnboxActivity(a, b)
          : compareReceivingRowsByScannedAt(a, b),
    );
    const windowed = normalizedList.slice(offset, offset + limit);
    // Lineless unfound placeholders without an open/unbox stamp sort last on
    // unboxed_newest and were silently dropped when the main query already
    // filled the page window.
    if (view === 'activity' && placeholderNorm.length > 0) {
      const windowRcvIds = new Set(
        windowed
          .map((r) => r.receiving_id)
          .filter((id): id is number => id != null && Number.isFinite(id)),
      );
      const missingPlaceholders = placeholderNorm.filter(
        (p) =>
          p.id < 0
          && p.receiving_id != null
          && !windowRcvIds.has(p.receiving_id),
      );
      normalizedList =
        missingPlaceholders.length > 0
          ? [...windowed, ...missingPlaceholders.slice(0, 50)]
          : windowed;
    } else {
      normalizedList = windowed;
    }
  }

  // Lineless cartons opened on the Unbox surface (any source — incl. ghost
  // zoho_po rows after the operator typed a PO#) never appear in the lines
  // query above; append them as placeholders keyed on UNBOX_SCAN_OPENED.
  if (shouldIncludeUnboxOpenedPlaceholders(query)) {
    const placeholders = buildUnboxOpenedPlaceholdersSql(query, orgId, unboxRailColumnRead);
    const [unboxPkgsRes, unboxCntRes] = await withTenantConnection(orgId, (client) => Promise.all([
      client.query(placeholders.list.sql, placeholders.list.params),
      client.query(placeholders.count.sql, placeholders.count.params),
    ]));
    total += Number(unboxCntRes.rows[0]?.n ?? 0);
    const unboxPlaceholderNorm = unboxPkgsRes.rows.map((pkg) =>
      normalizeRow(buildUnmatchedEmptyReceivingLine(pkg as Record<string, unknown>)),
    );
    for (const row of unboxPlaceholderNorm) {
      if (includeSerials) (row as Record<string, unknown>).serials = [];
    }
    normalizedList = [...normalizedList, ...unboxPlaceholderNorm].sort((a, b) =>
      compareReceivingRowsByUnboxOpenedAt(a, b),
    );
    const windowed = normalizedList.slice(offset, offset + limit);
    // Lineless unfound opened on the Unbox surface sort after lined rows and
    // were silently dropped when the main query already filled the page window.
    if (unboxPlaceholderNorm.length > 0) {
      const windowRcvIds = new Set(
        windowed
          .map((r) => r.receiving_id)
          .filter((id): id is number => id != null && Number.isFinite(id)),
      );
      const missingPlaceholders = unboxPlaceholderNorm.filter(
        (p) =>
          p.id < 0
          && p.receiving_id != null
          && !windowRcvIds.has(p.receiving_id),
      );
      normalizedList =
        missingPlaceholders.length > 0
          ? [...windowed, ...missingPlaceholders.slice(0, 50)]
          : windowed;
    } else {
      normalizedList = windowed;
    }
  }

  return { rows: normalizedList, total };
}

/** Label for unmatched cartons that have no `receiving_line` yet (Recent + History). */
/** Rank the Unbox recents page on the ordering column alone, then hand the list builder that carton set as `receivingIdIn`… */
/** Gate-before-decorate for `view=scanned&sort=priority` — the /triage rail's cold-load shape. */
async function maybePreLimitScannedLineIds(
  query: ReceivingLinesQuery,
  orgId: OrgId,
  offset: number,
  applyScannedZohoExclusion: boolean,
  unboxRailColumnRead: boolean,
): Promise<readonly number[] | null> {
  if (query.view !== 'scanned') return null;
  if (!query.wantsPrioritySort) return null;
  if (!Number.isFinite(offset) || offset > 0) return null;
  if (query.receivingIdIn.length > 0) return null;
  if (Number.isFinite(query.receivingId) && query.receivingId > 0) return null;
  if (query.trackingIn.length > 0) return null;
  if (query.search) return null;
  if (query.staffFilterRaw) return null;
  if (query.priorityOnly) return null;
  if (query.qaFilter || query.dispFilter || query.workflowFilter) return null;
  if (query.deliveryStateFilter) return null;
  if (query.poFrom || query.poTo) return null;
  if (query.weekStart || query.weekEnd) return null;
  if (query.unboxQueueStage || query.unboxQueueLane) return null;

  const limit =
    Number.isFinite(query.limit) && query.limit > 0 ? Math.min(query.limit, 200) : 50;
  try {
    const built = buildScannedCandidateSql({
      orgId,
      limit,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
    });
    const res = await tenantQuery<{ id: number }>(orgId, built.sql, built.params);
    const ids = res.rows
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    // No candidates → leave the query alone; an absent pre-limit is the
    // "run unrestricted" signal, not "match nothing".
    return ids.length > 0 ? ids : null;
  } catch (error) {
    console.error('maybePreLimitScannedLineIds failed; running unrestricted', error);
    return null;
  }
}

async function maybePreLimitUnboxOpened(
  query: ReceivingLinesQuery,
  orgId: OrgId,
  offset: number,
): Promise<ReceivingLinesQuery> {
  if (query.view !== 'unbox_opened') return query;
  if (query.receivingIdIn.length > 0) return query;
  if (Number.isFinite(query.receivingId) && query.receivingId > 0) return query;
  if (query.search) return query;
  if (query.staffFilterRaw) return query;
  if (query.priorityOnly) return query;
  if (!Number.isFinite(offset) || offset > 0) return query;

  const limit = Number.isFinite(query.limit) && query.limit > 0 ? query.limit : 50;
  try {
    const ranked = await tenantQuery<{ receiving_id: number }>(
      orgId,
      `SELECT ru.receiving_id
         FROM receiving_unbox ru
        WHERE ru.organization_id = $1
          AND ru.opened_at IS NOT NULL
        ORDER BY ru.opened_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    const ids = ranked.rows
      .map((r) => Number(r.receiving_id))
      .filter((n) => Number.isFinite(n) && n > 0);
    // No rows ranked → leave the query alone; an empty `receivingIdIn` is the
    // "no pre-limit" signal, not "match nothing".
    return ids.length > 0 ? { ...query, receivingIdIn: ids } : query;
  } catch (error) {
    console.error('maybePreLimitUnboxOpened failed; running unrestricted', error);
    return query;
  }
}


/**
 * `normalizeRow` input: synthetic line id `-receiving_id`, real `receiving_id`
 * (matches `buildUnmatchedStubRow` in the sidebar).
 */

function receivingRowScannedTs(row: {
  scanned_at?: string | null;
  received_at?: string | null;
  created_at?: string | null;
}) {
  const raw = row.scanned_at ?? row.received_at ?? row.created_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByScannedAt(
  a: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
  b: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowScannedTs(b) - receivingRowScannedTs(a);
  return d !== 0 ? d : b.id - a.id;
}

/** `view=unbox_opened` placeholder merge — newest Unbox-surface scan first (ops MRU). */
function receivingRowUnboxOpenedTs(row: { unbox_opened_at?: string | null }) {
  const raw = row.unbox_opened_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByUnboxOpenedAt(
  a: { unbox_opened_at?: string | null; id: number },
  b: { unbox_opened_at?: string | null; id: number },
) {
  const d = receivingRowUnboxOpenedTs(b) - receivingRowUnboxOpenedTs(a);
  return d !== 0 ? d : b.id - a.id;
}

function receivingRowActivityTs(row: {
  last_activity_at?: string | null;
  created_at?: string | null;
}) {
  const raw = row.last_activity_at ?? row.created_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByRecentActivity(
  a: { last_activity_at?: string | null; created_at?: string | null; id: number },
  b: { last_activity_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowActivityTs(b) - receivingRowActivityTs(a);
  return d !== 0 ? d : b.id - a.id;
}

/** `?sort=unboxed_newest` comparator for the placeholder merge. */
function receivingRowUnboxedTs(row: {
  unbox_opened_at?: string | null;
  unboxed_at?: string | null;
}) {
  const raw = row.unbox_opened_at ?? row.unboxed_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByUnboxedAt(
  a: {
    unbox_opened_at?: string | null;
    unboxed_at?: string | null;
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    id: number;
  },
  b: {
    unbox_opened_at?: string | null;
    unboxed_at?: string | null;
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    id: number;
  },
) {
  const d = receivingRowUnboxedTs(b) - receivingRowUnboxedTs(a);
  return d !== 0 ? d : compareReceivingRowsByScannedAt(a, b);
}

/** `?sort=unbox_activity` comparator — JS mirror of the SQL `GREATEST(ru.unboxed_at, rl.updated_at)` axis, so the placeholder merge… */
function receivingRowUnboxActivityTs(row: {
  unboxed_at?: string | null;
  updated_at?: string | null;
}) {
  const candidates = [row.unboxed_at, row.updated_at]
    .map((raw) => (raw ? new Date(raw).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function compareReceivingRowsByUnboxActivity(
  a: { unboxed_at?: string | null; updated_at?: string | null; last_activity_at?: string | null; created_at?: string | null; id: number },
  b: { unboxed_at?: string | null; updated_at?: string | null; last_activity_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowUnboxActivityTs(b) - receivingRowUnboxActivityTs(a);
  return d !== 0 ? d : compareReceivingRowsByRecentActivity(a, b);
}
