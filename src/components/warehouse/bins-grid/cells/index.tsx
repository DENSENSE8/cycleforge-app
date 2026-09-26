'use client';

/** Bins LedgerGrid cell registry — one switch, edit the matching case. */

import type { ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FillBar } from '@/components/warehouse/FillBar';
import { StatusChips } from '@/components/warehouse/StatusChip';
import { gridCellAlignClass } from '@/design-system/components/grid';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { resolveBinsSlotValue } from '@/lib/tables/field-catalog/bins-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { cn } from '@/utils/_cn';
import {
  BINS_GRID_FROZEN_CELL,
  binsGridCell,
  binsGridFrozenLeft,
  type BinsGridColumn,
} from '../bins-grid-layout';

/** Compact age label for `last_counted` — absolute ISO stays on the tooltip. */
function binsCountedAge(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const d = Math.floor(ms / 86400000);
  if (d < 1) return 'today';
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export interface BinsGridCellCtx {
  row: BinsOverviewRow;
  isChecked: boolean;
  onToggleSelect: (row: BinsOverviewRow) => void;
  /** The MOUNTED model — frozen offsets derive from it, never a static list. */
  columns: readonly BinsGridColumn[];
}

function dataCell(col: BinsGridColumn, rule = true) {
  return cn(binsGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

/** The body of one materialized slot track, chosen by the BOUND FIELD. */
function renderBinsSlotBody(fieldId: string | undefined, row: BinsOverviewRow): ReactNode {
  switch (fieldId) {
    case 'bins.location':
      return (
        <span className="flex min-w-0 flex-col items-start gap-0">
          <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
            {row.room ?? <span className="font-normal text-text-faint">—</span>}
            {row.zone_letter ? (
              <span className="ml-1 font-mono text-role-micro text-blue-600">
                [{row.zone_letter}]
              </span>
            ) : null}
          </span>
          <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
            {row.row_label != null && row.col_label != null
              ? `${row.row_label} · ${row.col_label}`
              : (row.name || 'Special bin')}
          </span>
        </span>
      );
    case 'bins.sku_count':
      return <span className="tabular-nums text-role-caption text-text-muted">{row.sku_count}</span>;
    case 'bins.total_qty':
      return <span className="tabular-nums text-role-caption text-text-muted">{row.total_qty}</span>;
    case 'bins.fill':
      return (
        <FillBar
          pct={row.fill_pct}
          current={row.total_qty}
          max={row.capacity}
          className="w-full min-w-0"
        />
      );
    case 'bins.last_counted':
      // The RELATIVE age is the scanning face; the absolute instant stays on
      // the tooltip. The resolver paints the civil day instead, because it must
      // not read the clock — see its docblock.
      return (
        <HoverTooltip label={row.last_counted ?? 'never'} asChild>
          <span className="min-w-0 truncate text-role-caption text-text-soft">
            {binsCountedAge(row.last_counted)}
          </span>
        </HoverTooltip>
      );
    case 'bins.status':
      return (
        <StatusChips
          is_empty={row.is_empty}
          has_low_stock={row.has_low_stock}
          is_over_capacity={row.is_over_capacity}
          is_stale={row.is_stale}
        />
      );
    default: {
      // A catalog field with no bespoke face paints its resolved text — a new
      // bindable fact needs a resolver case, never a new column file.
      const value = fieldId ? resolveBinsSlotValue(row, fieldId) : null;
      const text = value?.kind === 'value' ? value.text : null;
      return text ? (
        <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
      ) : (
        <GridCellDash />
      );
    }
  }
}

export function renderBinsGridCell(
  col: BinsGridColumn,
  rule: boolean,
  ctx: BinsGridCellCtx,
): ReactNode {
  const { row, isChecked, onToggleSelect, columns } = ctx;
  if (isSlotTrackKey(col.key)) {
    return (
      <div data-col={col.key} className={cn(dataCell(col, rule), 'min-w-0 gap-1')}>
        {renderBinsSlotBody(col.fieldId, row)}
      </div>
    );
  }
  switch (col.key) {
    case 'select':
      return (
        <div
          className={cn(
            binsGridCell({ inset: 'none', rule: true }),
            BINS_GRID_FROZEN_CELL,
            'justify-center',
          )}
          style={{ left: binsGridFrozenLeft(columns, 'select') }}
        >
          <GridRowCheckbox
            checked={isChecked}
            onToggle={() => onToggleSelect(row)}
            label={`Select ${row.barcode ?? row.name}`}
          />
        </div>
      );
    case 'barcode':
      return (
        <div
          data-col="barcode"
          className={cn(dataCell(col, rule), BINS_GRID_FROZEN_CELL, 'gap-1.5')}
          style={{ left: binsGridFrozenLeft(columns, 'barcode') }}
          data-frozen-edge
        >
          {row.barcode ? (
            <CopyableCellValue
              value={row.barcode}
              historyKind="bin"
              className="min-w-0 flex-1 text-role-data text-blue-700"
            />
          ) : (
            <GridCellDash />
          )}
        </div>
      );
    default:
      return <span className={dataCell(col, rule)} />;
  }
}
