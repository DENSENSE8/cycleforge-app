'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { GridCellDash } from '@/components/ui/grid-cells';
import { ledgerRowStateClass } from '@/components/ui/queue-row-chrome';
import {
  CATALOG_GRID_COLUMNS,
  CATALOG_GRID_FROZEN_CELL,
  catalogDisplayTitle,
  catalogGridCell,
  catalogGridFrozenLeft,
  catalogGridRowShellClass,
  catalogGridTemplate,
  type CatalogGridColumn,
} from '@/lib/products/catalog-grid-layout';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { cn } from '@/utils/_cn';

interface CatalogGridRowProps {
  row: CatalogListRow;
  isSelected: boolean;
  isChecked: boolean;
  inventoryProviderLabel?: string | null;
  onOpen: (row: CatalogListRow) => void;
  onToggleSelect: (row: CatalogListRow, event: { shiftKey: boolean }) => void;
  columns?: readonly CatalogGridColumn[];
}

/**
 * Catalog ledger leaf row — CSS-grid columns matching {@link CATALOG_GRID_COLUMNS}.
 * Airtable skin: left checkbox toggles selection; row body opens the product.
 */
export const CatalogGridRow = memo(function CatalogGridRow({
  row,
  isSelected,
  isChecked,
  inventoryProviderLabel,
  onOpen,
  onToggleSelect,
  columns = CATALOG_GRID_COLUMNS,
}: CatalogGridRowProps) {
  const title = catalogDisplayTitle(row);
  const dataCell = (col: CatalogGridColumn, rule = true) =>
    cn(catalogGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

  const renderCell = (col: CatalogGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              catalogGridCell({ inset: 'none', rule: true }),
              CATALOG_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: catalogGridFrozenLeft('select') }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={isChecked ? 'Deselect product' : 'Select product'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(row, { shiftKey: e.shiftKey });
              }}
              className={cn(
                'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                isChecked
                  ? 'border-accent-bg bg-accent-bg text-text-inverse'
                  : 'border-border-default bg-surface-card',
              )}
            >
              {isChecked ? <Check className="h-3 w-3" /> : null}
            </button>
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), CATALOG_GRID_FROZEN_CELL, 'relative min-w-0 gap-2')}
            style={{ left: catalogGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border-soft bg-surface-canvas">
              {row.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-role-micro text-text-faint">
                  —
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="min-w-0 truncate text-role-data text-text-default">{title}</span>
              {row.category ? (
                <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-wide text-text-muted">
                  {row.category}
                </span>
              ) : null}
            </div>
          </div>
        );
      case 'sku':
        return (
          <div data-col="sku" className={dataCell(col, rule)}>
            <span className="min-w-0 truncate font-mono text-role-caption text-text-muted">
              {row.sku}
            </span>
          </div>
        );
      case 'inventory':
        return (
          <div data-col="inventory" className={dataCell(col, rule)}>
            {row.is_inventory_linked ? (
              <InventoryMasterChip
                providerItemId={row.provider_item_id}
                providerLabel={inventoryProviderLabel}
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'channels':
        return (
          <div data-col="channels" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-default">
              {row.platform_count}
            </span>
          </div>
        );
      case 'manuals':
        return (
          <div data-col="manuals" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-default">
              {row.manual_count}
            </span>
          </div>
        );
      case 'qc':
        return (
          <div data-col="qc" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-default">
              {row.qc_step_count}
            </span>
          </div>
        );
      case 'orders':
        return (
          <div data-col="orders" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-default">
              {row.order_count}
            </span>
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={cn(dataCell(col, rule), 'flex-wrap gap-1')}>
            {row.has_pending_action ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-wider text-amber-800">
                Pending
              </span>
            ) : null}
            {!row.is_active ? (
              <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-eyebrow font-medium uppercase tracking-wide text-text-soft">
                Inactive
              </span>
            ) : null}
            {!row.has_pending_action && row.is_active ? (
              <span className="text-role-caption text-text-faint">Active</span>
            ) : null}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-catalog-row-id={String(row.id)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Open product ${title}`}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        catalogGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowStateClass(isSelected || isChecked),
      )}
      style={{ gridTemplateColumns: catalogGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
