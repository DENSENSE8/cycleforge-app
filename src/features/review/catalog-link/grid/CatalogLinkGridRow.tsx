'use client';

/**
 * One Review · Catalog link chore — CSS-grid columns matching
 * {@link CATALOG_LINK_GRID_COLUMNS}.
 *
 * Read-only: no inline editor and no fold. The row opens the chore at the RECORD
 * plane (`?choreId=`), where the right-rail form does the linking — resolving a
 * chore backfills every matching order, so it is side-effectful multi-step work
 * and belongs nowhere near a cell popover (`display/workbench.md` → Action planes).
 */

import { Fragment, memo, type ReactNode } from 'react';
import { OrderIdChip, SkuScanRefChip } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateCellValue, GridPlatformMarkValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { formatDateKeyShort, formatDateTimePST, toPSTDateKey } from '@/utils/date';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import { cn } from '@/utils/_cn';
import { CATALOG_LINK_GRID_CAPABILITIES } from './catalog-link-grid-descriptor';
import {
  CATALOG_LINK_GRID_COLUMNS,
  CATALOG_LINK_GRID_FROZEN_CELL,
  catalogLinkGridCell,
  catalogLinkGridFrozenLeft,
  catalogLinkGridRowShellClass,
  catalogLinkGridTemplate,
  type CatalogLinkGridColumn,
} from './catalog-link-grid-layout';

const dataCell = (col: CatalogLinkGridColumn, rule = true) =>
  cn(catalogLinkGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/** The listing a chore is about — its title, else the Item Number it came in as. */
export function catalogLinkChoreLabel(chore: CatalogLinkChoreRow): string | null {
  return chore.productTitle || chore.itemNumber || null;
}

export const CatalogLinkGridRow = memo(function CatalogLinkGridRow({
  chore,
  isSelected,
  onOpenChore,
  columns = CATALOG_LINK_GRID_COLUMNS,
}: {
  chore: CatalogLinkChoreRow;
  isSelected: boolean;
  onOpenChore: (id: number) => void;
  columns?: readonly CatalogLinkGridColumn[];
}) {
  const label = catalogLinkChoreLabel(chore);
  const platform = sourcePlatformMetaFromLabel(chore.accountSource);

  const renderCell = (col: CatalogLinkGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              catalogLinkGridCell({ inset: 'none', rule: true }),
              CATALOG_LINK_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: catalogLinkGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), CATALOG_LINK_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: catalogLinkGridFrozenLeft('title') }}
            data-frozen-edge
          >
            {label ? (
              <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
                {label}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'item':
        return (
          <div data-col="item" className={dataCell(col, rule)}>
            <OrderIdChip
              value={chore.itemNumber}
              display={chore.itemNumber}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      case 'source':
        return (
          <div data-col="source" className={dataCell(col, rule)}>
            <GridPlatformMarkValue platformValue={platform.value} label={platform.label} />
          </div>
        );
      case 'sku':
        return (
          <div data-col="sku" className={dataCell(col, rule)}>
            {chore.sku ? (
              <SkuScanRefChip value={chore.sku} display={chore.sku} dense />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'orders':
        return (
          <div data-col="orders" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-muted">
              {chore.orderCount}
            </span>
          </div>
        );
      case 'first':
        return (
          <div data-col="first" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={formatDateKeyShort(toPSTDateKey(chore.firstSeenAt))}
              tooltip={formatDateTimePST(chore.firstSeenAt)}
              className="text-role-caption"
            />
          </div>
        );
      case 'last':
        return (
          <div data-col="last" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={formatDateKeyShort(toPSTDateKey(chore.lastSeenAt))}
              tooltip={formatDateTimePST(chore.lastSeenAt)}
              className="text-role-caption"
            />
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-catalog-link-row-id={chore.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Catalog link chore ${chore.itemNumber}`}
      onClick={() => onOpenChore(chore.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenChore(chore.id);
        }
      }}
      className={cn(
        catalogLinkGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: CATALOG_LINK_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: catalogLinkGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
