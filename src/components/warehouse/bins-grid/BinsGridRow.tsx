'use client';

import { memo } from 'react';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { LedgerGridLeafRow } from '@/design-system/components/grid';
import {
  renderBinsGridCell,
  type BinsGridCellCtx,
} from './cells';
import { BINS_GRID_CAPABILITIES } from './bins-grid-descriptor';
import {
  binsGridTemplate,
  type BinsGridColumn,
} from './bins-grid-layout';

/** One warehouse bin — CSS-grid columns matching the MOUNTED model (a `SlotLayout` materialization since the wave 1.4 hand-model kill). */
export const BinsGridRow = memo(function BinsGridRow({
  row,
  isChecked,
  onOpen,
  onToggleSelect,
  columns,
}: {
  row: BinsOverviewRow;
  isChecked: boolean;
  onOpen: (row: BinsOverviewRow) => void;
  onToggleSelect: (row: BinsOverviewRow) => void;
  columns: readonly BinsGridColumn[];
}) {
  const ctx: BinsGridCellCtx = {
    row,
    isChecked,
    onToggleSelect,
    columns,
  };

  return (
    <LedgerGridLeafRow
      data-bins-row-id={row.id}
      role="button"
      tabIndex={0}
      aria-pressed={isChecked}
      aria-label={`Open bin ${row.barcode ?? row.name}`}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      columns={columns}
      template={binsGridTemplate(columns)}
      selected={isChecked}
      capabilities={BINS_GRID_CAPABILITIES}
      renderCell={(col, { rule }) => renderBinsGridCell(col, rule, ctx)}
    />
  );
});
