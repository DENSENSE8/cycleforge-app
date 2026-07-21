'use client';

import { useMemo } from 'react';
import { type ReceivingLineRow } from '@/components/station/receiving-line-row';
import { workflowStage, workflowStageDot } from '@/lib/receiving/workflow-stages';
import { RecentActivityRailBase, type ApiResponse } from './RecentActivityRailBase';
import { filterReceivingRailRows } from '@/components/sidebar/tech/filter-receiving-rail-rows';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';

/**
 * Color logic for the left status dot in Testing view. Colors come straight
 * from the shared lifecycle registry (workflow-stages.ts) so the testing flow
 * (awaiting → in-test → passed/failed) reads with the same per-stage hues as
 * everywhere else, rather than collapsing receipt states into one blue bucket.
 */
export function getTestingStatusDot(row: ReceivingLineRow): string {
  return workflowStageDot(row.workflow_status);
}

function getTestingStatusDotLabel(row: ReceivingLineRow): string {
  const stage = workflowStage(row.workflow_status);
  // Short lifecycle label only — the old `${label} — ${description}` form wrapped
  // into a full-width banner in the hover popover badge. DONE is the terminal
  // "finalized" stage, but operator-facing it reads as "Received" (matching the
  // receiving rails + workflowStatusTableLabel's DONE → RECEIVED), never "Done".
  if (stage.status === 'DONE') return 'Received';
  return stage.label;
}

/** Full invalidation triggers — module-scope so the shell's refresh-listener
 * effect keeps a stable identity and subscribes once (a fresh array literal each
 * render made it re-subscribe, risking a dropped event mid-swap). */
const TESTING_TESTED_REFRESH_EVENTS = [
  'app-refresh-data',
  'testing-result-recorded',
];

/**
 * Testing dock age axis = this tester's verdict time. `view=testing` folds
 * `tested_at` into `last_activity_at`; prefer explicit `tested_at` when present.
 * Never fall through to `created_at` (scan/import time) — that was the jump
 * `dispatchTestingLineUpdated` strip-lists tried (and failed) to paper over.
 */
function getTestingActivityAt(row: ReceivingLineRow): string | null {
  return row.tested_at ?? row.last_activity_at ?? null;
}

/**
 * Computes "Tested" quantity for a line in the Testing feed. Prefers the real
 * recorded-verdict count from the API (`tested_count`, scoped to this tester);
 * a line with verdicts but a non-terminal workflow_status (e.g. partway through
 * a multi-unit line, or still IN_TEST) then reads "k/N" instead of a misleading
 * "0/N". Falls back to the terminal-status heuristic for feeds/rows that don't
 * carry tested_count (the no-tester activity fallback, older cached rows).
 */
function getTestedQty(row: ReceivingLineRow): number {
  if (typeof row.tested_count === 'number') {
    return Math.min(row.tested_count, row.quantity_received);
  }
  const v = String(row.workflow_status || '').trim().toUpperCase();
  const isTested = ['PASSED', 'DONE', 'FAILED', 'SCRAP', 'RTV'].some(s => v.startsWith(s));
  return isTested ? row.quantity_received : 0;
}

interface Props {
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  limit?: number;
  /** Scopes both feeds to this staff member when set (queue → assignments, tested → verdicts). */
  testerId?: number | null;
  /** Client-side filter over the loaded rail rows. */
  filterText?: string;
}

/**
 * Compact personal recently-tested rail for the Testing workspace. Pending and
 * Returns are full tables in the main workbench; this rail stays a quick-reopen
 * map and never duplicates those queues.
 */
export function TestingRecentRail({
  selectedLineId,
  selectedRow = null,
  limit = 25,
  testerId = null,
  filterText = '',
}: Props) {
  const scopedTesterId =
    Number.isFinite(testerId) && (testerId as number) > 0 ? (testerId as number) : null;
  const trimmedFilter = filterText.trim();

  const queryKey = useMemo(
    () =>
      [
        'receiving-lines-table',
        'rail',
        'tested',
        scopedTesterId != null ? String(scopedTesterId) : 'none',
        trimmedFilter,
      ] as const,
    [scopedTesterId, trimmedFilter],
  );

  const fetchFn = async (): Promise<ApiResponse> => {
    // Without a signed-in tester, never fetch the org-wide testing feed — return
    // empty so the rail cannot leak other staffers' verdicts.
    if (scopedTesterId == null) {
      return { success: true, receiving_lines: [], total: 0 };
    }
    const params = new URLSearchParams({ limit: '500', offset: '0' });
    params.set('include', 'serials');
    params.set('view', 'testing');
    params.set('tester', String(scopedTesterId));
    const res = await fetch(`${TESTING_RECEIVING_LINES_API}?${params.toString()}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    if (!trimmedFilter) return data;
    const receiving_lines = filterReceivingRailRows(data.receiving_lines ?? [], trimmedFilter);
    return { ...data, receiving_lines, total: receiving_lines.length };
  };

  return (
    <RecentActivityRailBase
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        limit={limit}
        queryKey={queryKey}
        fetchFn={fetchFn}
        // Mode isolation: ignore shared `receiving-line-updated`. Workspace
        // patches (serials / verdict) stay on that bus; dock membership +
        // tested qty reconcile via refreshEvents + allowlisted RQ helpers.
        refreshEvents={TESTING_TESTED_REFRESH_EVENTS}
        navigateEvent="testing-navigate-rail"
        eyebrowTitle="Recent"
        eyebrowSuffix="You"
        getActivityAt={getTestingActivityAt}
        getStatusDot={getTestingStatusDot}
        getStatusDotLabel={getTestingStatusDotLabel}
        renderQuantity={(row) => {
          const tested = getTestedQty(row);
          const received = row.quantity_received;
          return (
            <span className={tested >= received && received > 0 ? 'text-text-success' : 'text-text-muted'}>
              {tested}/{received}
            </span>
          );
        }}
        previewQtyLabel="Tested"
        getPreviewQty={(row) => ({
          current: getTestedQty(row),
          total: row.quantity_received,
        })}
      />
  );
}
