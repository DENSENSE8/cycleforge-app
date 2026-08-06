'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import {
  CATALOG_GRID_COLUMNS,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
} from '@/lib/products/catalog-grid-layout';
import { makeCatalogGridDescriptor } from './catalog-grid-descriptor';
import { CatalogGridColumnHeader } from './CatalogGridColumnHeader';
import { CatalogGridRow } from './CatalogGridRow';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

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
  dir: GridSortDir | null;
  onSortChange: (key: CatalogGridColumnKey, dir: GridSortDir) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly CatalogGridColumn[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** Portal target for the column-display (▦) trigger — e.g. a triage-band controls slot. */
  columnTriggerPortalTarget?: HTMLElement | null;
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
  columnTriggerPortalTarget,
}: CatalogGridViewProps) {
  const { selectedIds, toggle } = useTableSelectMode<CatalogListRow>({
    scope: selectionScope,
    selectMode: true,
    rows,
    getId: (r) => r.id,
  });

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
    (row: CatalogListRow, visible: readonly CatalogGridColumn[]) => (
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
    [selectedId, selectedIds, inventoryProviderLabel, onOpen, onToggleSelect],
  );

  return (
    <LedgerGridSurface<CatalogListRow, CatalogGridColumnKey, CatalogGridColumn>
      ariaLabel="Product catalog"
      surface="sheet"
      columns={columns}
      makeDescriptor={makeCatalogGridDescriptor}
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
      tableId={CATALOG_TABLE_ID}
      columnTriggerPortalTarget={columnTriggerPortalTarget ?? null}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <CatalogGridColumnHeader
          selectionScope={selectionScope}
          columns={visible}
          activeSort={sort}
          sortDir={dir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => renderLeaf(group.rows[0], visible)}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
