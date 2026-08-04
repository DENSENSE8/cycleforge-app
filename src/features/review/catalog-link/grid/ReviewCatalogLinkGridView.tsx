'use client';

/**
 * Review · Catalog link collection map — both tabs on the Workbench spreadsheet
 * SoT (`LedgerGridSurface` + a `GridSurfaceDescriptor`), replacing the pair of
 * hand-rolled `divide-y` `<ul>` lists this surface used to render.
 *
 * **One mount file, two column models.** The tabs are separate components
 * (separate hooks, separate `TableId`s, separate sort vocabularies) but they
 * share one capabilities bag and one file, so the capability guard has exactly
 * one mount to certify — see `catalog-link-grid-descriptor.ts`.
 *
 * Row ORDER defaults to the API's own ranking; a column sort replaces it and is
 * URL-durable via `?colsort=`/`?coldir=` (never `?sort=` — see
 * `source-of-truth.md` → Grid column visibility + sort).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import {
  makeCatalogLinkGridDescriptor,
  makeImportExceptionGridDescriptor,
} from './catalog-link-grid-descriptor';
import {
  CatalogLinkGridColumnHeader,
  ImportExceptionGridColumnHeader,
} from './CatalogLinkGridColumnHeader';
import { CatalogLinkGridRow, catalogLinkChoreLabel } from './CatalogLinkGridRow';
import { ImportExceptionGridRow, importExceptionLabel } from './ImportExceptionGridRow';
import {
  CATALOG_LINK_GRID_COLUMNS,
  CATALOG_LINK_TABLE_ID,
  defaultDirForCatalogLinkGridSort,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
  type CatalogLinkGridColumnKey,
} from './catalog-link-grid-layout';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  IMPORT_EXCEPTION_TABLE_ID,
  defaultDirForImportExceptionGridSort,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
  type ImportExceptionGridColumnKey,
} from './import-exception-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * One-shot "settle" re-render after the grid first has data.
 *
 * The virtualized `LedgerGrid` mounts its scroll element in the same commit the
 * data arrives, and with no async label/selection churn in this subtree its
 * internal re-measure can miss on first paint — leaving the body blank until the
 * first interaction. Same fix as `PickupGridView` / `WarrantyGridView`.
 */
function useGridSettleTick(loading: boolean, hasRows: boolean) {
  const [, settleTick] = useState(0);
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);
}

interface SharedGridProps {
  loading: boolean;
  /** Settled with nothing at all — an ALL-CLEAR here, so say what it means. */
  emptyMessage: string;
  /** Settled with no MATCHES — a different answer (clear the filter). */
  searchEmptyMessage?: string;
  isSearching?: boolean;
}

// ── Tab A · Needs catalog link ────────────────────────────────────────────────

function compareChoreRows(
  a: CatalogLinkChoreRow,
  b: CatalogLinkChoreRow,
  key: CatalogLinkGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * (catalogLinkChoreLabel(a) || '').localeCompare(catalogLinkChoreLabel(b) || '');
    case 'item':
      return sign * a.itemNumber.localeCompare(b.itemNumber);
    case 'source':
      return sign * a.accountSource.localeCompare(b.accountSource);
    case 'sku':
      return sign * (a.sku || '').localeCompare(b.sku || '');
    case 'orders':
      return sign * (a.orderCount - b.orderCount);
    case 'first':
      return sign * a.firstSeenAt.localeCompare(b.firstSeenAt);
    case 'last':
      return sign * a.lastSeenAt.localeCompare(b.lastSeenAt);
    default:
      return 0;
  }
}

export function CatalogLinkChoresGrid({
  rows,
  selectedChoreId,
  onOpenChore,
  columns = CATALOG_LINK_GRID_COLUMNS,
  ...shared
}: SharedGridProps & {
  rows: CatalogLinkChoreRow[];
  selectedChoreId: number | null;
  onOpenChore: (id: number) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly CatalogLinkGridColumn[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<CatalogLinkGridColumnKey>({
    isColumn: isCatalogLinkGridSortable,
    defaultDir: defaultDirForCatalogLinkGridSort,
  });

  useGridSettleTick(shared.loading, rows.length > 0);

  const orderGroupsByDate = useMemo<[string, RowGroup<CatalogLinkChoreRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareChoreRows(a, b, columnSort, sortDir))
        : rows;
    // One unnamed band — a chore queue has no day/fold axis. Safe when empty:
    // `LedgerGrid` decides emptiness from ROW count, not band count.
    return [['', ordered.map((chore) => ({ key: `chore:${chore.id}`, rows: [chore] }))]];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (chore: CatalogLinkChoreRow, visible: readonly CatalogLinkGridColumn[]) => (
    <CatalogLinkGridRow
      key={chore.id}
      chore={chore}
      isSelected={chore.id === selectedChoreId}
      onOpenChore={onOpenChore}
      columns={visible}
    />
  );

  return (
    <LedgerGridSurface<CatalogLinkChoreRow, CatalogLinkGridColumnKey, CatalogLinkGridColumn>
      ariaLabel="Listings needing a catalog link"
      columns={columns}
      makeDescriptor={makeCatalogLinkGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={shared.loading}
      emptyMessage={shared.emptyMessage}
      searchEmptyMessage={shared.searchEmptyMessage}
      isSearching={shared.isSearching}
      scrollRef={scrollRef}
      testId="catalog-link-grid-body"
      tableId={CATALOG_LINK_TABLE_ID}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <CatalogLinkGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((chore) => renderLeaf(chore, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}

// ── Tab B · Missing item number ───────────────────────────────────────────────

function compareExceptionRows(
  a: ImportExceptionRow,
  b: ImportExceptionRow,
  key: ImportExceptionGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * (importExceptionLabel(a) || '').localeCompare(importExceptionLabel(b) || '');
    case 'order':
      return sign * a.accountOrderId.localeCompare(b.accountOrderId);
    case 'source':
      return sign * a.accountSource.localeCompare(b.accountSource);
    case 'tracking':
      return sign * (a.tracking || '').localeCompare(b.tracking || '');
    case 'sheet': {
      // A row with no sheet pointer is an UNKNOWN, not row 0 — park it last in
      // both directions rather than at whichever end is being read.
      const av = a.sheetRow;
      const bv = b.sheetRow;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sign * (av - bv);
    }
    case 'seen':
      return sign * (a.seenCount - b.seenCount);
    case 'first':
      return sign * a.firstSeenAt.localeCompare(b.firstSeenAt);
    case 'last':
      return sign * a.lastSeenAt.localeCompare(b.lastSeenAt);
    default:
      return 0;
  }
}

export function ImportExceptionsGrid({
  rows,
  selectedExceptionId,
  onOpenException,
  columns = IMPORT_EXCEPTION_GRID_COLUMNS,
  ...shared
}: SharedGridProps & {
  rows: ImportExceptionRow[];
  selectedExceptionId: number | null;
  onOpenException: (id: number) => void;
  columns?: readonly ImportExceptionGridColumn[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ImportExceptionGridColumnKey>({
    isColumn: isImportExceptionGridSortable,
    defaultDir: defaultDirForImportExceptionGridSort,
  });

  useGridSettleTick(shared.loading, rows.length > 0);

  const orderGroupsByDate = useMemo<[string, RowGroup<ImportExceptionRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareExceptionRows(a, b, columnSort, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `exception:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (row: ImportExceptionRow, visible: readonly ImportExceptionGridColumn[]) => (
    <ImportExceptionGridRow
      key={row.id}
      row={row}
      isSelected={row.id === selectedExceptionId}
      onOpenException={onOpenException}
      columns={visible}
    />
  );

  return (
    <LedgerGridSurface<ImportExceptionRow, ImportExceptionGridColumnKey, ImportExceptionGridColumn>
      ariaLabel="Sheet rows missing an item number"
      columns={columns}
      makeDescriptor={makeImportExceptionGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={shared.loading}
      emptyMessage={shared.emptyMessage}
      searchEmptyMessage={shared.searchEmptyMessage}
      isSearching={shared.isSearching}
      scrollRef={scrollRef}
      testId="import-exception-grid-body"
      tableId={IMPORT_EXCEPTION_TABLE_ID}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <ImportExceptionGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((row) => renderLeaf(row, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
