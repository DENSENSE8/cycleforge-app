'use client';

/**
 * History triage paint — header-band paint-bucket left of List|Drill.
 * Applies GRID_HIGHLIGHT_PRESETS (Rose + siblings) to bulk-selected rows.
 * Not a grid-column chrome cell — top-left of the sheet stays select-all.
 */

import { useMemo } from 'react';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import {
  GridRowPaintTrigger,
  useGridRowFills,
} from '@/design-system/components/grid';
import { useTableSelection } from '@/hooks/useTableSelection';

export function HistoryRowPaintChrome({ className }: { className?: string }) {
  const selectedRows = useTableSelection<{ id?: number | string }>(
    RECEIVING_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const selectedIds = useMemo(
    () => new Set(selectedRows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id))),
    [selectedRows],
  );
  const { fillsById, paintRows } = useGridRowFills('receiving');

  return (
    <div className={className}>
      <GridRowPaintTrigger
        selectedIds={selectedIds}
        fillsById={fillsById}
        onPaint={paintRows}
      />
    </div>
  );
}
