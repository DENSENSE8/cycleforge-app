'use client';

/**
 * One data row of an uploaded file on the upload check — the row's status,
 * its order (last 8 on the face, the full number copied) and, per file
 * column, the file value against the saved one: equal → the value once;
 * different → both, the saved side in the danger ink on a danger wash;
 * not saved → the file value muted; blank → nothing.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { LedgerGridLeafRow, gridCellAlignClass } from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { LEDGER_GRID_FROZEN_CELL, ledgerGridCell } from '@/design-system/components/grid/grid-cell-chrome';
import { GridCellDash } from '@/components/ui/grid-cells';
import { PASTED_LIST_CELL, rangeEdgeShadow, type RowRangeSlice } from '@/components/search/pasted-list/PastedListGridRow';
import { getLast8 } from '@/lib/copy-chip-format';
import type { ImportCheckCell, ImportCheckRow } from '@/lib/inbound/import-check';
import { cn } from '@/utils/_cn';
import {
  IMPORT_CHECK_CAPABILITIES,
  IMPORT_ROW_STATUS_FACE,
  importCheckCellHint,
  importCheckCellOf,
  importFileValueText,
  type ImportCheckColumnKey,
  type ImportCheckSheetColumn,
} from './import-check-table';

function FileCellValue({ cell }: { cell: ImportCheckCell }) {
  if (cell.state === 'blank') return null;
  if (cell.state === 'not_saved') return <span className="min-w-0 truncate text-text-faint">{importFileValueText(cell)}</span>;
  if (cell.state === 'equal') return <span className="min-w-0 truncate text-text-default">{importFileValueText(cell)}</span>;
  return (
    <span data-cell-different className="flex min-w-0 items-baseline gap-1">
      <span className="min-w-0 truncate text-text-muted">{importFileValueText(cell) || '(blank)'}</span>
      <span aria-hidden className="shrink-0 text-text-faint">
        →
      </span>
      <span className="min-w-0 truncate font-medium text-text-danger">{cell.saved || '(blank)'}</span>
    </span>
  );
}

export const ImportCheckGridRow = memo(function ImportCheckGridRow({
  row,
  index,
  columns,
  lit,
  range,
  flash,
  onPoint,
}: {
  row: ImportCheckRow;
  /** Position in the sheet — the range's row index. */
  index: number;
  columns: readonly ImportCheckSheetColumn[];
  /** The pointer / keyboard cursor. */
  lit: boolean;
  /** The selected cells on this row, or null. */
  range: RowRangeSlice | null;
  /** The cell just copied (a fading wash); `n` restarts it. */
  flash: { col: ImportCheckColumnKey; n: number } | null;
  onPoint: () => void;
}) {
  const washPresence = useMotionPresence(motionPresence.findCellCopied);
  const wash = useMotionTransition(motionTransition.findCellCopied);
  const status = IMPORT_ROW_STATUS_FACE[row.status];

  const renderValue = (column: ImportCheckSheetColumn) => {
    switch (column.key) {
      case 'row':
        return <span className="tabular-nums text-text-faint">{row.rowNumber}</span>;
      case 'status':
        return <span className={cn('min-w-0 truncate font-medium', status.tone)}>{status.label}</span>;
      case 'order':
        return row.orderNumber ? <span className="min-w-0 truncate">{getLast8(row.orderNumber)}</span> : <GridCellDash />;
      case 'problem':
        return row.problem ? <span className={cn('min-w-0 truncate', status.tone)}>{row.problem}</span> : <GridCellDash />;
      default: {
        const cell = importCheckCellOf(row, column);
        return cell ? <FileCellValue cell={cell} /> : null;
      }
    }
  };

  return (
    <LedgerGridLeafRow<ImportCheckSheetColumn>
      columns={columns}
      template={gridTemplate(columns)}
      selected={lit}
      capabilities={IMPORT_CHECK_CAPABILITIES}
      data-import-check-row={row.rowNumber}
      data-import-status={row.status}
      data-range-row={index}
      className="group/row cursor-cell"
      onPointerEnter={onPoint}
      renderCell={(col) => {
        const frozen = col.frozen === true;
        const at = columns.indexOf(col);
        const inRange = range != null && at >= range.c0 && at <= range.c1;
        const edge = inRange ? rangeEdgeShadow(range, at) : undefined;
        const different = importCheckCellOf(row, col)?.state === 'different';
        return (
          <div
            data-col={col.key}
            data-in-range={inRange || undefined}
            title={importCheckCellHint(row, col) || undefined}
            className={cn(
              ledgerGridCell({ inset: 'none' }),
              'relative overflow-hidden',
              PASTED_LIST_CELL,
              gridCellAlignClass(col),
              frozen && LEDGER_GRID_FROZEN_CELL,
              'min-w-0 text-role-caption text-text-default',
              col.key === 'order' && 'font-mono font-semibold',
              different && 'bg-surface-danger',
              inRange && 'bg-gradient-to-r',
              inRange && (range.anchorCol === at ? 'from-accent-bg/20 to-accent-bg/20' : 'from-accent-bg/10 to-accent-bg/10'),
            )}
            style={frozen || edge ? { left: frozen ? gridFrozenLeft(columns, col.key) : undefined, boxShadow: edge } : undefined}
          >
            {renderValue(col)}
            <AnimatePresence>
              {flash?.col === col.key ? (
                <motion.span
                  key={flash.n}
                  aria-hidden
                  data-cell-copied
                  initial={washPresence.initial}
                  animate={washPresence.animate}
                  transition={wash}
                  className="pointer-events-none absolute inset-0 bg-surface-accent"
                />
              ) : null}
            </AnimatePresence>
          </div>
        );
      }}
    />
  );
});
