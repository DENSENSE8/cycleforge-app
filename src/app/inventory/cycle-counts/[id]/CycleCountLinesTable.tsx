'use client';

/**
 * Admin › Cycle count lines — the CLIENT ISLAND for
 * `/inventory/cycle-counts/[id]`.
 *
 * The page stays an RSC: it guards on `admin.view`, runs `loadCampaign` /
 * `loadLines` / `loadStatusCounts`, owns the `?status=` filter pills and the
 * Close-campaign form, and declares all four server actions. None of that
 * moves. This file is only the boundary the slot engine needs (hooks, layout
 * cascade, header sort), and it takes its rows as props — the SQL stays on the
 * server.
 *
 * Same shape as `../../returns/RecentReturnsTable.tsx` and
 * `../../bulk-allocate/AllocationCandidatesTable.tsx`.
 *
 * ## How the three server actions cross the boundary
 *
 * `submitCountAction` / `approveAction` / `rejectAction` are declared in the
 * page with `'use server'` in their bodies, so Next compiles each to a server
 * action REFERENCE, and passing that reference through a prop is exactly what
 * the retired `<form action={…}>` in a table cell did — a client `<form>` was
 * already invoking them over the same channel. What crosses is the id of the
 * action, never its code: `getCurrentUser()`, the `Number.isFinite` payload
 * guards, the `?error=invalid_qty` redirect and
 * `revalidatePath('/inventory/cycle-counts/<id>')` all still run ON THE
 * SERVER, inside each action, unchanged and un-bypassable from here.
 *
 * The payloads stay `FormData` with the same keys (`campaignId`, `lineId`,
 * `countedQty`), because keeping the signatures identical is what makes "every
 * gate and revalidate is untouched" a fact rather than a claim.
 */

import { useCallback, useState, useTransition } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { CycleCountLinePlane } from '@/components/inventory/cycle-count-lines/CycleCountLinePlane';
import { resolveCycleCountLineRowActions } from '@/components/inventory/cycle-count-lines/cycle-count-lines-verbs';
import { useCycleCountLinesSpreadsheet } from '@/components/inventory/cycle-count-lines/useCycleCountLinesSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';

type LineAction = (formData: FormData) => Promise<void>;

export interface CycleCountLinesTableProps {
  rows: readonly CycleCountLineRow[];
  /** `submitCountAction` — takes `campaignId`, `lineId`, `countedQty`. */
  submitCount: LineAction;
  /** `approveAction` — takes `campaignId`, `lineId`. */
  approveLine: LineAction;
  /** `rejectAction` — takes `campaignId`, `lineId`. */
  rejectLine: LineAction;
  emptyMessage: string;
  searchEmptyMessage: string;
}

export function CycleCountLinesTable({
  rows,
  submitCount,
  approveLine,
  rejectLine,
  emptyMessage,
  searchEmptyMessage,
}: CycleCountLinesTableProps) {
  const [, startTransition] = useTransition();
  const [pendingLineId, setPendingLineId] = useState<number | null>(null);
  const [countTarget, setCountTarget] = useState<CycleCountLineRow | null>(null);

  /**
   * One write path for all three verbs. Each action revalidates this route, so
   * the re-counted / decided line arrives on the transition rather than from a
   * client refetch — the same refresh the retired `<form>` submit produced.
   */
  const run = useCallback(
    (row: CycleCountLineRow, action: LineAction, countedQty?: number) => {
      const payload = new FormData();
      payload.set('campaignId', String(row.campaignId));
      payload.set('lineId', String(row.id));
      if (countedQty != null) payload.set('countedQty', String(countedQty));
      setPendingLineId(row.id);
      startTransition(async () => {
        try {
          await action(payload);
          setCountTarget(null);
        } finally {
          setPendingLineId(null);
        }
      });
    },
    [],
  );

  const rowActions = useCallback(
    (row: CycleCountLineRow): readonly CompoundRowAction[] =>
      resolveCycleCountLineRowActions(row, {
        onCount: setCountTarget,
        onApprove: (line) => run(line, approveLine),
        onReject: (line) => run(line, rejectLine),
        isPending: (line) => line.id === pendingLineId,
      }),
    [run, approveLine, rejectLine, pendingLineId],
  );

  const sheet = useCycleCountLinesSpreadsheet({ rows, emptyMessage, rowActions });

  return (
    <div className="relative flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} totalCount={rows.length} searchEmptyMessage={searchEmptyMessage} />
      <CycleCountLinePlane
        row={countTarget}
        busy={countTarget != null && countTarget.id === pendingLineId}
        onClose={() => {
          if (pendingLineId == null) setCountTarget(null);
        }}
        onSubmit={(row, countedQty) => run(row, submitCount, countedQty)}
      />
    </div>
  );
}
