'use client';

/**
 * Bins LedgerGrid cell registry — one switch, edit the matching case.
 * Row shell builds {@link BinsGridCellCtx}; domain values stay here.
 */

import type { ReactNode } from 'react';
import { GridCellDash } from '@/components/ui/grid-cells';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FillBar } from '@/components/warehouse/FillBar';
import { StatusChips } from '@/components/warehouse/StatusChip';
import { gridCellAlignClass } from '@/design-system/components/grid';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
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
}

function dataCell(col: BinsGridColumn, rule = true) {
  return cn(binsGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

export function renderBinsGridCell(
  col: BinsGridColumn,
  rule: boolean,
  ctx: BinsGridCellCtx,
): ReactNode {
  const { row, isChecked, onToggleSelect } = ctx;
  switch (col.key) {
    case 'select':
      return (
        <div
          className={cn(
            binsGridCell({ inset: 'none', rule: true }),
            BINS_GRID_FROZEN_CELL,
            'justify-center',
          )}
          style={{ left: binsGridFrozenLeft('select') }}
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
          style={{ left: binsGridFrozenLeft('barcode') }}
          data-frozen-edge
        >
          {row.barcode ? (
            <span className="min-w-0 flex-1 truncate font-mono text-role-data text-blue-700">
              {row.barcode}
            </span>
          ) : (
            <GridCellDash />
          )}
        </div>
      );
    case 'location':
      return (
        <div data-col="location" className={cn(dataCell(col, rule), 'flex-col items-start gap-0')}>
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
        </div>
      );
    case 'sku_count':
      return (
        <div data-col="sku_count" className={dataCell(col, rule)}>
          <span className="tabular-nums text-role-caption text-text-muted">{row.sku_count}</span>
        </div>
      );
    case 'total_qty':
      return (
        <div data-col="total_qty" className={dataCell(col, rule)}>
          <span className="tabular-nums text-role-caption text-text-muted">{row.total_qty}</span>
        </div>
      );
    case 'fill':
      return (
        <div data-col="fill" className={cn(dataCell(col, rule), 'min-w-0')}>
          <FillBar
            pct={row.fill_pct}
            current={row.total_qty}
            max={row.capacity}
            className="w-full min-w-0"
          />
        </div>
      );
    case 'last_counted':
      return (
        <div data-col="last_counted" className={dataCell(col, rule)}>
          <HoverTooltip label={row.last_counted ?? 'never'} asChild>
            <span className="min-w-0 truncate text-role-caption text-text-soft">
              {binsCountedAge(row.last_counted)}
            </span>
          </HoverTooltip>
        </div>
      );
    case 'status':
      return (
        <div data-col="status" className={cn(dataCell(col, rule), 'min-w-0 gap-1')}>
          <StatusChips
            is_empty={row.is_empty}
            has_low_stock={row.has_low_stock}
            is_over_capacity={row.is_over_capacity}
            is_stale={row.is_stale}
          />
        </div>
      );
    default:
      return <span className={dataCell(col, rule)} />;
  }
}
