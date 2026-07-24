'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import type {
  CatalogGridColumnKey,
  CatalogGridSortDir,
} from '@/lib/products/catalog-grid-layout';
import { CATALOG_GRID_DESCRIPTOR } from './catalog-grid-descriptor';
import { CatalogGridColumnHeader } from './CatalogGridColumnHeader';
import { CatalogGridRow } from './CatalogGridRow';

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
  scrollRef,
  className,
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
    (row: CatalogListRow, stripeIndex: number) => (
      <CatalogGridRow
        key={row.id}
        row={row}
        index={stripeIndex}
        isSelected={selectedId === row.id}
        isChecked={selectedIds.has(row.id)}
        inventoryProviderLabel={inventoryProviderLabel}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
      />
    ),
    [selectedId, selectedIds, inventoryProviderLabel, onOpen, onToggleSelect],
  );

  return (
    <LedgerGridSurface<CatalogListRow, CatalogGridColumnKey>
      descriptor={CATALOG_GRID_DESCRIPTOR}
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
          activeSort={sort}
          sortDir={dir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group, baseStripeIndex) => renderLeaf(group.rows[0], baseStripeIndex)}
      renderRow={(row, stripeIndex) => renderLeaf(row, stripeIndex)}
    />
  );
}
