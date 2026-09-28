'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { resolveTechAllSlotValue } from '@/lib/tables/field-catalog/tech-all-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import {
  TECH_ALL_GRID_FROZEN_CELL,
  techAllGridCell,
  techAllGridFrozenLeft,
  techAllGridRowShellClass,
  techAllGridTemplate,
  type TechAllGridColumn,
} from '@/lib/tech/tech-all-grid-layout';
import { cn } from '@/utils/_cn';
import { TECH_ALL_GRID_CAPABILITIES } from './tech-all-grid-descriptor';

const dataCell = (col: TechAllGridColumn, rule = true) =>
  cn(techAllGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/**
 * One Tech All triage row — click opens the typed home (station / repair / pickup).
 */
export const TechAllGridRow = memo(function TechAllGridRow({
  row,
  onOpen,
  columns,
}: {
  row: TechAllTriageRow;
  onOpen: (row: TechAllTriageRow) => void;
  columns: readonly TechAllGridColumn[];
}) {
  /** The body of one materialized slot track, chosen by the BOUND FIELD. */
  const renderSlotBody = (fieldId: string | undefined): ReactNode => {
    switch (fieldId) {
      case 'tech-all.type':
        return (
          <span className="min-w-0 truncate text-role-caption font-medium text-text-soft">
            {row.typeLabel}
          </span>
        );
      case 'tech-all.stage':
        return <span className="min-w-0 truncate text-role-caption text-text-soft">{row.stage}</span>;
      case 'tech-all.urgency':
        return (
          <span className="tabular-nums text-role-caption text-text-faint">{row.urgencyRank}</span>
        );
      default: {
        // A catalog field with no bespoke face paints its resolved text — a new
        // bindable fact needs a resolver case, never a new column file.
        const value = fieldId ? resolveTechAllSlotValue(row, fieldId) : null;
        const text = value?.kind === 'value' ? value.text : null;
        return text ? (
          <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
        ) : (
          <GridCellDash />
        );
      }
    }
  };

  const renderCell = (col: TechAllGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    if (isSlotTrackKey(col.key)) {
      return (
        <div data-col={col.key} className={dataCell(col, rule)}>
          {renderSlotBody(col.fieldId)}
        </div>
      );
    }
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              techAllGridCell({ inset: 'none', rule: true }),
              TECH_ALL_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: techAllGridFrozenLeft(columns, 'select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'identity':
        return (
          <div
            data-col="identity"
            className={cn(dataCell(col, rule), TECH_ALL_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: techAllGridFrozenLeft(columns, 'identity') }}
            data-frozen-edge
          >
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {row.title}
            </span>
            {row.subtitle ? (
              <CopyableCellValue
                value={row.subtitle}
                className="min-w-0 shrink truncate text-role-eyebrow text-text-faint"
                dense
              />
            ) : null}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-tech-all-row-id={row.id}
      role="button"
      tabIndex={0}
      aria-label={`${row.typeLabel}: ${row.title}`}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        techAllGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({ selected: false, capabilities: TECH_ALL_GRID_CAPABILITIES }),
        'cursor-pointer',
      )}
      style={{ gridTemplateColumns: techAllGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
