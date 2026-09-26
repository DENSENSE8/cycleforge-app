'use client';

import { memo } from 'react';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { LedgerGridLeafRow } from '@/design-system/components/grid';
import { renderUnitsGridCell, type UnitsGridCellCtx } from './cells';
import { UNITS_GRID_CAPABILITIES } from './units-grid-descriptor';
import {
  unitsGridTemplate,
  type UnitsGridColumn,
} from './units-grid-layout';

/** One serialized unit — CSS-grid columns matching the MOUNTED model (a `SlotLayout` materialization since the wave 1.4 hand-model kill;… */
export const UnitsGridRow = memo(function UnitsGridRow({
  row,
  onOpen,
  columns,
}: {
  row: UnitsOverviewRow;
  onOpen: (row: UnitsOverviewRow) => void;
  columns: readonly UnitsGridColumn[];
}) {
  const ctx: UnitsGridCellCtx = { row, columns };

  return (
    <LedgerGridLeafRow
      data-units-row-id={row.id}
      role="button"
      tabIndex={0}
      aria-label={`Open unit ${row.serial_number ?? row.id}`}
      selected={false}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      columns={columns}
      template={unitsGridTemplate(columns)}
      capabilities={UNITS_GRID_CAPABILITIES}
      renderCell={(col, { rule }) =>
        renderUnitsGridCell(col as UnitsGridColumn, rule, ctx)
      }
    />
  );
});
