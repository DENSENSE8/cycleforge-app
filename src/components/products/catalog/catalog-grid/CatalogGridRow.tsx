'use client';

import { memo } from 'react';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { CATALOG_GRID_CAPABILITIES } from '@/components/products/catalog/catalog-grid/catalog-grid-descriptor';
import {
  renderCatalogGridCell,
  type CatalogGridCellCtx,
} from '@/components/products/catalog/catalog-grid/cells';
import {
  catalogDisplayTitle,
  catalogGridTemplate,
  type CatalogGridColumn,
} from '@/lib/products/catalog-grid-layout';
import { LedgerGridLeafRow } from '@/design-system/components/grid';

interface CatalogGridRowProps {
  row: CatalogListRow;
  isSelected: boolean;
  isChecked: boolean;
  inventoryProviderLabel?: string | null;
  onOpen: (row: CatalogListRow) => void;
  onToggleSelect: (row: CatalogListRow, event: { shiftKey: boolean }) => void;
  columns: readonly CatalogGridColumn[];
}

/**
 * Catalog ledger leaf row — CSS-grid columns matching {@link CATALOG_GRID_COLUMNS}.
 * Desktop cells live under `./cells/`; edit a column there, not here.
 */
export const CatalogGridRow = memo(function CatalogGridRow({
  row,
  isSelected,
  isChecked,
  inventoryProviderLabel,
  onOpen,
  onToggleSelect,
  columns,
}: CatalogGridRowProps) {
  const title = catalogDisplayTitle(row);
  const ctx: CatalogGridCellCtx = {
    row,
    title,
    isChecked,
    inventoryProviderLabel,
    onToggleSelect,
    columns,
  };

  return (
    <LedgerGridLeafRow
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
      columns={columns}
      template={catalogGridTemplate(columns)}
      selected={isSelected || isChecked}
      capabilities={CATALOG_GRID_CAPABILITIES}
      renderCell={(col, { rule }) => renderCatalogGridCell(col, rule, ctx)}
    />
  );
});
