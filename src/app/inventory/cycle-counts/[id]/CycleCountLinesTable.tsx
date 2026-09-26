'use client';

/** Admin › Cycle count lines — the CLIENT ISLAND for `/inventory/cycle-counts/[id]`. */

import { useCallback, useState, useTransition } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { CycleCountLinePlane } from '@/components/inventory/cycle-count-lines/CycleCountLinePlane';
import { resolveCycleCountLineRowActions } from '@/components/inventory/cycle-count-lines/cycle-count-lines-verbs';
import { useCycleCountLinesSpreadsheet } from '@/components/inventory/cycle-count-lines/useCycleCountLinesSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';

type LineAction = (formData: FormData) => Promise<void>;

interface CycleCountLinesTableProps {
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
