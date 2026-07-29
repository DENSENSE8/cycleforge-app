'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import {
  CATALOG_GRID_COLUMNS,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
  type CatalogGridSortDir,
} from '@/lib/products/catalog-grid-layout';
import { makeCatalogGridDescriptor } from './catalog-grid-descriptor';
import { CatalogGridColumnHeader } from './CatalogGridColumnHeader';
import { CatalogGridRow } from './CatalogGridRow';

/** Staff-prefs identity — one catalog spreadsheet, one Fields selection. */
const CATALOG_TABLE_ID = 'catalog' as const;

interface CatalogGridViewProps {
  rows: CatalogListRow[];
  loading: boolean;
  emptyMessage: string;
  selectionScope: string;
  /** Highlighted open row id (optional). */
  selectedId?: number | null;
  inventoryProviderLabel?: string | null;
  onOpenRow: (row: CatalogListRow) => void;
  sort: CatalogGridColumnKey | null;
  dir: CatalogGridSortDir | null;
  onSortChange: (key: CatalogGridColumnKey, dir: CatalogGridSortDir) => void;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly CatalogGridColumn[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}

/**
 * Products Catalog spreadsheet — catalog-domain adapter over
 * {@link LedgerGridSurface}. Same shell recipe as outbound `OrdersGridView` /
 * repair `RepairGridView` (rounded card + airtable skin + scrollX).
 */
export function CatalogGridView({
  rows,
  loading,
  emptyMessage,
  selectionScope,
  selectedId = null,
  inventoryProviderLabel,
  onOpenRow,
  sort,
  dir,
  onSortChange,
  columns = CATALOG_GRID_COLUMNS,
  scrollRef,
  className,
}: CatalogGridViewProps) {
  const { selectedIds, toggle } = useTableSelectMode<CatalogListRow>({
    scope: selectionScope,
    selectMode: true,
    rows,
    getId: (r) => r.id,
  });

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  // Header, rows and the grid template all read `visible` — a hidden column
  // loses its TRACK rather than rendering an empty ruled cell.
  const { columns: visible } = useGridColumnVisibility<CatalogGridColumn>({
    columns,
    tableId: CATALOG_TABLE_ID,
  });

  const descriptor = useMemo(() => makeCatalogGridDescriptor(visible), [visible]);

  const orderGroupsByDate = useMemo<[string, RowGroup<CatalogListRow>[]][]>(
    () => [['', rows.map((r) => ({ key: String(r.id), rows: [r] }))]],
    [rows],
  );

  const onOpen = useCallback((r: CatalogListRow) => onOpenRow(r), [onOpenRow]);
  const onToggleSelect = useCallback(
    (r: CatalogListRow, event: { shiftKey: boolean }) => toggle(r.id, event.shiftKey),
    [toggle],
  );

  const renderLeaf = useCallback(
    (row: CatalogListRow) => (
      <CatalogGridRow
        key={row.id}
        row={row}
        isSelected={selectedId === row.id}
        isChecked={selectedIds.has(row.id)}
        inventoryProviderLabel={inventoryProviderLabel}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
        columns={visible}
      />
    ),
    [selectedId, selectedIds, inventoryProviderLabel, onOpen, onToggleSelect, visible],
  );

  return (
    <LedgerGridSurface<CatalogListRow, CatalogGridColumnKey>
      ariaLabel="Product catalog"
      descriptor={descriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={sort}
      dir={dir}
      onSortChange={onSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      className={className}
      testId="catalog-grid-body"
      renderColumnHeader={({ toggleColumnSort }) => (
        <CatalogGridColumnHeader
          selectionScope={selectionScope}
          columns={visible}
          activeSort={sort}
          sortDir={dir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group) => renderLeaf(group.rows[0])}
      renderRow={(row) => renderLeaf(row)}
    />
  );
}
