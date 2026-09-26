'use client';

/** Units LedgerGrid cell registry — one switch, edit the matching case. */

import type { ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridStatusCellValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { unitStatusBadgeClass, unitStatusDotClass } from '@/lib/unit-status';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { resolveUnitsSlotValue } from '@/lib/tables/field-catalog/units-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { cn } from '@/utils/_cn';
import {
  UNITS_GRID_FROZEN_CELL,
  unitsGridCell,
  unitsGridFrozenLeft,
  type UnitsGridColumn,
} from '../units-grid-layout';

/** Compact age for `updated` — absolute ISO stays on the tooltip (relative, not a civil-day label). */
function unitUpdatedAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const d = Math.floor(ms / 86400000);
  if (d < 1) return 'today';
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export interface UnitsGridCellCtx {
  row: UnitsOverviewRow;
  /** The MOUNTED model — frozen offsets derive from it, never a static list. */
  columns: readonly UnitsGridColumn[];
}

function dataCell(col: UnitsGridColumn, rule = true) {
  return cn(unitsGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

/** The body of one materialized slot track, chosen by the BOUND FIELD. */
function renderUnitsSlotBody(fieldId: string | undefined, row: UnitsOverviewRow): ReactNode {
  switch (fieldId) {
    case 'units.status':
      return (
        <GridStatusCellValue
          label={row.current_status}
          toneClass={unitStatusBadgeClass(row.current_status)}
          dotClass={unitStatusDotClass(row.current_status)}
        />
      );
    case 'units.condition':
      return row.condition_grade ? (
        <span
          className={cn(
            'text-role-caption font-semibold',
            conditionGradeTextClass(row.condition_grade),
          )}
        >
          {conditionGradeTableLabel(row.condition_grade)}
        </span>
      ) : (
        <GridCellDash />
      );
    case 'units.location':
      return row.current_location ? (
        <span className="min-w-0 truncate text-role-caption text-text-muted">
          {row.current_location}
        </span>
      ) : (
        <GridCellDash />
      );
    case 'units.updated':
      // The RELATIVE age is the scanning face; the absolute instant stays on
      // the tooltip. The resolver paints the civil day instead, because it must
      // not read the clock — see its docblock.
      return row.updated_at ? (
        <HoverTooltip label={row.updated_at} asChild>
          <span className="min-w-0 truncate text-role-caption text-text-soft">
            {unitUpdatedAge(row.updated_at)}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      );
    default: {
      // A catalog field with no bespoke face paints its resolved text — a new
      // bindable fact needs a resolver case, never a new column file.
      const value = fieldId ? resolveUnitsSlotValue(row, fieldId) : null;
      const text = value?.kind === 'value' ? value.text : null;
      return text ? (
        <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
      ) : (
        <GridCellDash />
      );
    }
  }
}

export function renderUnitsGridCell(
  col: UnitsGridColumn,
  rule: boolean,
  ctx: UnitsGridCellCtx,
): ReactNode {
  const { row, columns } = ctx;
  if (isSlotTrackKey(col.key)) {
    return (
      <div data-col={col.key} className={cn(dataCell(col, rule), 'min-w-0')}>
        {renderUnitsSlotBody(col.fieldId, row)}
      </div>
    );
  }
  switch (col.key) {
    case 'serial':
      return (
        <div
          data-col="serial"
          className={cn(dataCell(col, rule), UNITS_GRID_FROZEN_CELL, 'gap-1.5')}
          style={{ left: unitsGridFrozenLeft(columns, 'serial') }}
          data-frozen-edge
        >
          {row.serial_number ? (
            <CopyableCellValue
              value={row.serial_number}
              historyKind="serial"
              className="min-w-0 flex-1 text-role-data text-blue-700"
            />
          ) : (
            <GridCellDash />
          )}
        </div>
      );
    case 'product':
      return (
        <div data-col="product" className={cn(dataCell(col, rule), 'flex-col items-start gap-0')}>
          <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
            {row.product_title || <span className="font-normal text-text-faint">Untitled unit</span>}
          </span>
          <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
            {row.sku || '—'}
          </span>
        </div>
      );
    default:
      return <span className={dataCell(col, rule)} />;
  }
}
