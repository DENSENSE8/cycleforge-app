'use client';

/** Second 48px compound leaf — serial / location / View unit. */

import { gridDataCellClass, LEDGER_GRID_FROZEN_CELL } from '@/design-system/components/grid';
import { ledgerGridRowShellClass } from '@/design-system/components/grid/grid-cell-chrome';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { COMPOUND_ROW_PX } from '@/components/tables/compound/compound-row-chrome';
import type { CompoundRowDetail } from '@/components/tables/compound/compound-row-model';
import { CompoundRowDetailFacts } from '@/components/tables/compound/CompoundRowDetailFacts';
import { cn } from '@/utils/_cn';

type CompoundRowDetailBandColumn = {
  key: string;
  width: string;
  frozen?: boolean;
};

function isGutterColumn(key: string): boolean {
  return key === 'select' || key === 'thumb';
}

export function CompoundRowDetailBand({
  detail,
  title,
  columns,
}: {
  detail: CompoundRowDetail;
  title: string;
  columns: readonly CompoundRowDetailBandColumn[];
}) {
  const template = gridTemplate(columns);
  const frozenEdgeKey = [...columns].reverse().find((c) => c.frozen)?.key;

  return (
    <div
      role="row"
      data-compound-row-detail=""
      aria-label={`Details for ${title.trim() || 'this line'}`}
      // Leaf face, not a canvas wash — same ruling as the group band
      // (SlotTableGroupParentRow). Operator 2026-09-14: expanded state is an
      className={cn(ledgerGridRowShellClass(false), 'bg-surface-card')}
      style={{ gridTemplateColumns: template, minHeight: COMPOUND_ROW_PX }}
      onClick={(event) => event.stopPropagation()}
    >
      {columns.map((col, i) => {
        const last = i === columns.length - 1;
        const frozenEdge = col.frozen && col.key === frozenEdgeKey ? true : undefined;
        const className = cn(
          gridDataCellClass(col, {
            rule: !last,
            inset: isGutterColumn(col.key) ? 'none' : 'cell',
            frozenClass: LEDGER_GRID_FROZEN_CELL,
          }),
          'overflow-hidden',
        );
        const style = {
          height: COMPOUND_ROW_PX,
          ...(col.frozen ? { left: gridFrozenLeft(columns, col.key) } : null),
        };

        if (col.key === 'item') {
          return (
            <div
              key={col.key}
              data-col="item"
              data-frozen-edge={frozenEdge}
              className={cn(className, 'min-w-0 gap-2 text-xs text-text-muted')}
              style={style}
            >
              <CompoundRowDetailFacts detail={detail} title={title} />
            </div>
          );
        }

        return (
          <div
            key={col.key}
            data-col={col.key}
            data-frozen-edge={frozenEdge}
            className={className}
            style={style}
            role="presentation"
            aria-hidden
          />
        );
      })}
    </div>
  );
}
