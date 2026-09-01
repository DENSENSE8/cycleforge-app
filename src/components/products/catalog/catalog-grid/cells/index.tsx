'use client';

/**
 * Catalog LedgerGrid cell registry — one switch, edit the matching case.
 * Since the wave 1.4 slot port the fact tracks are MATERIALIZED
 * (`status:1…N` / `subtitle:1…N`), so the switch runs on the bound FIELD ID,
 * not on a hardcoded column key. Structural tracks (`select · title`) keep
 * their own cases.
 *
 * Row shell builds {@link CatalogGridCellCtx}; domain values stay here.
 */

import type { ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import {
  CATALOG_GRID_FROZEN_CELL,
  catalogGridCell,
  catalogGridFrozenLeft,
  type CatalogGridColumn,
} from '@/lib/products/catalog-grid-layout';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { resolveCatalogSlotValue } from '@/lib/tables/field-catalog/catalog-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { cn } from '@/utils/_cn';

export interface CatalogGridCellCtx {
  row: CatalogListRow;
  title: string;
  isChecked: boolean;
  inventoryProviderLabel?: string | null;
  onToggleSelect: (row: CatalogListRow, event: { shiftKey: boolean }) => void;
  /** The MOUNTED model — frozen offsets derive from it, never a static list. */
  columns: readonly CatalogGridColumn[];
}

function dataCell(col: CatalogGridColumn, rule = true) {
  return cn(catalogGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

/** The body of one materialized slot track, chosen by the BOUND FIELD. */
function renderCatalogSlotBody(
  fieldId: string | undefined,
  row: CatalogListRow,
  inventoryProviderLabel: string | null | undefined,
): ReactNode {
  const count = (value: number) => (
    <span className="tabular-nums text-role-caption text-text-default">{value}</span>
  );
  switch (fieldId) {
    case 'catalog.sku':
      return (
        <CopyableCellValue
          value={row.sku}
          historyKind="sku"
          className="min-w-0 flex-1 text-role-caption text-text-muted"
          dense
        />
      );
    case 'catalog.inventory':
      return row.is_inventory_linked ? (
        <InventoryMasterChip
          providerItemId={row.provider_item_id}
          providerLabel={inventoryProviderLabel}
        />
      ) : (
        <GridCellDash />
      );
    case 'catalog.channels':
      return count(row.platform_count);
    case 'catalog.manuals':
      return count(row.manual_count);
    case 'catalog.qc':
      return count(row.qc_step_count);
    case 'catalog.orders':
      return count(row.order_count);
    case 'catalog.status':
      return (
        <span className="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden">
          {row.has_pending_action ? (
            <span className="min-w-0 truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-wider text-amber-800">
              Pending
            </span>
          ) : null}
          {!row.is_active ? (
            <span className="min-w-0 truncate rounded bg-surface-sunken px-1.5 py-0.5 text-role-eyebrow font-medium uppercase tracking-wide text-text-soft">
              Inactive
            </span>
          ) : null}
          {!row.has_pending_action && row.is_active ? (
            <span className="truncate text-role-caption text-text-faint">Active</span>
          ) : null}
        </span>
      );
    default: {
      // A catalog field with no bespoke face paints its resolved text — a new
      // bindable fact needs a resolver case, never a new column file.
      const value = fieldId ? resolveCatalogSlotValue(row, fieldId) : null;
      const text = value?.kind === 'value' ? value.text : null;
      return text ? (
        <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
      ) : (
        <GridCellDash />
      );
    }
  }
}

export function renderCatalogGridCell(
  col: CatalogGridColumn,
  rule: boolean,
  ctx: CatalogGridCellCtx,
): ReactNode {
  const { row, title, isChecked, inventoryProviderLabel, onToggleSelect, columns } = ctx;
  if (isSlotTrackKey(col.key)) {
    return (
      <div data-col={col.key} className={cn(dataCell(col, rule), 'min-w-0 gap-1 overflow-hidden')}>
        {renderCatalogSlotBody(col.fieldId, row, inventoryProviderLabel)}
      </div>
    );
  }
  switch (col.key) {
    case 'select':
      return (
        <div
          className={cn(
            catalogGridCell({ inset: 'none', rule: true }),
            CATALOG_GRID_FROZEN_CELL,
            'justify-center',
          )}
          style={{ left: catalogGridFrozenLeft(columns, 'select') }}
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
          style={{ left: catalogGridFrozenLeft(columns, 'title') }}
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
    default:
      return <span className={dataCell(col, rule)} />;
  }
}
