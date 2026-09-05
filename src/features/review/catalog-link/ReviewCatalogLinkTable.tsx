'use client';

/**
 * Review · Listing match — unmatched listings and sheet rows missing an item
 * number, as a flush workbench sheet.
 *
 * There is no page chrome: {@link DataTable} draws the find field and the
 * section strip from data, over the two registered bindings.
 *
 * A row click opens {@link CatalogLinkFormRail} or {@link ImportExceptionFormRail}
 * in the single `RightRailHost` slot. `?choreId=` / `?exceptionId=` carry the
 * selection so a picked row survives a refresh and is linkable.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataTableToolbarAction } from '@/components/tables/DataTable';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { compareGridValues } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { rowGroupTotals, singleBand, type RowGroup } from '@/lib/group-rows';
import {
  CatalogLinkFormRail,
  ImportExceptionFormRail,
} from '@/features/review/catalog-link/CatalogLinkFormRail';
import { catalogLinkCompoundView } from '@/features/review/catalog-link/grid/catalog-link-compound-view';
import { useCatalogLinkTableLayout } from '@/features/review/catalog-link/grid/useCatalogLinkTableLayout';
import { useImportExceptionTableLayout } from '@/features/review/catalog-link/grid/useImportExceptionTableLayout';
import { importExceptionSlotValuesFor } from '@/lib/tables/field-catalog/import-exception-resolve';
import { catalogLinkSlotValuesFor } from '@/lib/tables/field-catalog/catalog-link-resolve';
import { CATALOG_LINK_GRID_CAPABILITIES } from '@/features/review/catalog-link/grid/catalog-link-grid-descriptor';
import {
  catalogLinkCompoundColumnsFor,
  CATALOG_LINK_SORT_TYPES,
  defaultDirForCatalogLinkGridSort,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
  type CatalogLinkGridColumnKey,
} from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { CATALOG_LINK_TABLE_BINDING } from '@/features/review/catalog-link/grid/catalog-link-table-definition';
import { importExceptionCompoundView } from '@/features/review/catalog-link/grid/import-exception-compound-view';
import { IMPORT_EXCEPTION_GRID_CAPABILITIES } from '@/features/review/catalog-link/grid/import-exception-grid-descriptor';
import {
  importExceptionCompoundColumnsFor,
  IMPORT_EXCEPTION_SORT_TYPES,
  defaultDirForImportExceptionGridSort,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
  type ImportExceptionGridColumnKey,
} from '@/features/review/catalog-link/grid/import-exception-grid-layout';
import { IMPORT_EXCEPTION_TABLE_BINDING } from '@/features/review/catalog-link/grid/import-exception-table-definition';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import {
  useCatalogLinkQueue,
  useCatalogLinkQueueActions,
  useImportExceptionQueue,
} from '@/features/review/catalog-link/useCatalogLinkQueues';
import { itemNumberFromPaste } from '@/lib/inventory/listing-candidate';
import { toast } from '@/lib/toast';

type CatalogLinkSection = 'catalog-link' | 'missing-item-number';

function parseSection(raw: string | null): CatalogLinkSection {
  return raw === 'missing-item-number' ? 'missing-item-number' : 'catalog-link';
}

function parsePositiveId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * The section strip. `catalog-link` (Listing match) is the default, so it IS
 * the unfiltered view and lights no tab — see {@link DataTable}.
 */
const REVIEW_SECTION_TABS = [
  { id: 'missing-item-number', label: 'Missing item number' },
] as const;

export function ReviewCatalogLinkTable(_props: Record<string, unknown>) {
  // The effective slot layout (staff ?? org ?? product) materialized into the
  // compound tracks — matching chores are facts an organization binds, not a
  // private column model.
  const { effectiveLayout: catalogLinkLayout, fields: catalogLinkFields } =
    useCatalogLinkTableLayout();
  const catalogLinkColumns = useMemo(
    () => catalogLinkCompoundColumnsFor(catalogLinkLayout),
    [catalogLinkLayout],
  );

  // The page's SECOND queue keeps its own document — same cells, different
  // vocabulary, exactly as incoming and receiving do.
  const { effectiveLayout: importExceptionLayout, fields: importExceptionFields } =
    useImportExceptionTableLayout();
  const importExceptionColumns = useMemo(
    () => importExceptionCompoundColumnsFor(importExceptionLayout),
    [importExceptionLayout],
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = parseSection(searchParams.get('section'));
  const [query, setQueryState] = useState('');
  const choreId = parsePositiveId(searchParams.get('choreId'));
  const exceptionId = parsePositiveId(searchParams.get('exceptionId'));

  const chores = useCatalogLinkQueue(query);
  const exceptions = useImportExceptionQueue(query);
  const { invalidateChores, invalidateExceptions } = useCatalogLinkQueueActions();

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('mode', 'catalog-link');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSection = useCallback(
    (next: CatalogLinkSection) => {
      writeParams((p) => {
        if (next === 'missing-item-number') p.set('section', 'missing-item-number');
        else p.delete('section');
        p.delete('choreId');
        p.delete('exceptionId');
      });
    },
    [writeParams],
  );

  const setQuery = useCallback((next: string) => setQueryState(next), []);

  const selectChore = useCallback(
    (id: number | null) => {
      writeParams((p) => {
        p.delete('section');
        p.delete('exceptionId');
        if (id == null) p.delete('choreId');
        else p.set('choreId', String(id));
      });
    },
    [writeParams],
  );

  const selectException = useCallback(
    (id: number | null) => {
      writeParams((p) => {
        p.set('section', 'missing-item-number');
        p.delete('choreId');
        if (id == null) p.delete('exceptionId');
        else p.set('exceptionId', String(id));
      });
    },
    [writeParams],
  );

  const choreSort = useUrlColumnSort<CatalogLinkGridColumnKey>({
    isColumn: isCatalogLinkGridSortable,
    defaultDir: defaultDirForCatalogLinkGridSort,
  });
  const exceptionSort = useUrlColumnSort<ImportExceptionGridColumnKey>({
    isColumn: isImportExceptionGridSortable,
    defaultDir: defaultDirForImportExceptionGridSort,
  });

  const choreRows = useMemo(() => {
    const items = chores.data?.items ?? [];
    const { sort, dir } = choreSort;
    if (!sort || !dir) return items;
    const type = CATALOG_LINK_SORT_TYPES[sort];
    const value = (r: CatalogLinkChoreRow) => {
      switch (sort) {
        case 'item':
          return r.productTitle ?? r.itemNumber;
        case 'fulfillment':
          return r.itemNumber;
        case 'source':
          return r.accountSource;
        case 'sku':
          return r.sku;
        case 'orders':
        case 'amount':
          return r.orderCount;
        case 'first':
          return Date.parse(r.firstSeenAt);
        case 'last':
        case 'state':
          return Date.parse(r.lastSeenAt);
        case 'thumb':
          return null;
        default:
          return r.productTitle;
      }
    };
    return [...items].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir });
      return primary !== 0 ? primary : b.orderCount - a.orderCount || b.id - a.id;
    });
  }, [chores.data?.items, choreSort]);

  const exceptionRows = useMemo(() => {
    const items = exceptions.data?.items ?? [];
    const { sort, dir } = exceptionSort;
    if (!sort || !dir) return items;
    const type = IMPORT_EXCEPTION_SORT_TYPES[sort];
    const value = (r: ImportExceptionRow) => {
      switch (sort) {
        case 'order':
        case 'fulfillment':
          return r.accountOrderId;
        case 'source':
          return r.accountSource;
        case 'tracking':
          return r.tracking;
        case 'sheet':
          return r.sheetRow;
        case 'seen':
        case 'amount':
          return r.seenCount;
        case 'first':
          return Date.parse(r.firstSeenAt);
        case 'last':
        case 'state':
          return Date.parse(r.lastSeenAt);
        case 'item':
          return r.productTitle;
        case 'thumb':
          return null;
        default:
          return r.productTitle;
      }
    };
    return [...items].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir });
      return primary !== 0 ? primary : b.id - a.id;
    });
  }, [exceptions.data?.items, exceptionSort]);

  const choreGroups = useMemo(
    () => singleBand(choreRows, (r) => String(r.id)) as [string, RowGroup<CatalogLinkChoreRow>[]][],
    [choreRows],
  );
  const exceptionGroups = useMemo(
    () =>
      singleBand(exceptionRows, (r) => String(r.id)) as [string, RowGroup<ImportExceptionRow>[]][],
    [exceptionRows],
  );

  const _choreTotals = useMemo(
    () => rowGroupTotals({ key: 'catalog-link', rows: choreRows }, { orders: (r) => r.orderCount }),
    [choreRows],
  );
  const _exceptionTotals = useMemo(
    () => rowGroupTotals({ key: 'import-exception', rows: exceptionRows }, {}),
    [exceptionRows],
  );

  const selectedChore = choreRows.find((r) => r.id === choreId) ?? null;
  const selectedException = exceptionRows.find((r) => r.id === exceptionId) ?? null;
  const missingSection = section === 'missing-item-number';
  const [pasting, setPasting] = useState(false);

  const commitImportPaste = useCallback(
    async (raw: string) => {
      const itemNumber = itemNumberFromPaste(raw);
      if (!itemNumber) return;
      const target = selectedException ?? exceptionRows[0] ?? null;
      if (!target) {
        toast.error('Nothing in the queue to import.');
        return;
      }
      setPasting(true);
      try {
        const res = await fetch('/api/review/import-exceptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'resolve', id: target.id, itemNumber }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          orderId?: number | null;
        };
        if (!res.ok || !body.success) throw new Error(body.error || 'Import failed');
        toast.success(
          body.orderId
            ? `Imported order ${body.orderId} with item ${itemNumber}.`
            : `Imported item ${itemNumber} — order details filled from the sheet.`,
        );
        invalidateExceptions();
        selectException(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not import that item number.');
      } finally {
        setPasting(false);
      }
    },
    [exceptionRows, invalidateExceptions, selectException, selectedException],
  );

  const importActions = useMemo<readonly DataTableToolbarAction[]>(
    () => [
      {
        id: 'paste-item',
        label: 'Paste item #',
        variant: 'primary',
        disabled: exceptionRows.length === 0,
        busy: pasting,
        testId: 'import-exception-paste-item',
        paste: {
          placeholder: 'Item number or listing URL…',
          onCommit: (value) => void commitImportPaste(value),
        },
      },
    ],
    [commitImportPaste, exceptionRows.length, pasting],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      {
          missingSection ? (
            <DataTable<
              ImportExceptionRow,
              ImportExceptionGridColumnKey,
              ImportExceptionGridColumn
            >
              binding={IMPORT_EXCEPTION_TABLE_BINDING}
              search={{
                value: query,
                onChange: setQuery,
                placeholder: missingSection ? 'Filter sheet rows…' : 'Filter listings…',
              }}
              tabs={REVIEW_SECTION_TABS}
              activeTab={missingSection ? 'missing-item-number' : undefined}
              onTabChange={(id) =>
                setSection(
                  id === 'missing-item-number' && !missingSection
                    ? 'missing-item-number'
                    : 'catalog-link',
                )
              }
              columns={importExceptionColumns}
              fields={importExceptionFields}
              actions={importActions}
              orderGroupsByDate={exceptionGroups}
              rows={exceptionRows}
              getRowId={(r) => String(r.id)}
              sort={exceptionSort.sort}
              dir={exceptionSort.dir}
              onSortChange={exceptionSort.setSort}
              loading={exceptions.isLoading}
              emptyMessage={
                exceptions.isError
                  ? 'Could not load missing item numbers.'
                  : query.trim() !== ''
                    ? 'No sheet row matches that search.'
                    : 'No sheet rows are missing an item number.'
              }
              renderGroup={(group, _stripe, { columns: visible }) => (
                <>
                  {group.rows.map((row) => (
                    <CompoundRow
                      key={row.id}
                      data-import-exception-id={row.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={exceptionId === row.id}
                      aria-label={`Missing item number ${row.accountOrderId}`}
                      className="group/row cursor-pointer"
                      onClick={() => selectException(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectException(row.id);
                        }
                      }}
                      columns={visible}
                      capabilities={IMPORT_EXCEPTION_GRID_CAPABILITIES}
                      selected={exceptionId === row.id}
                      view={{
                        // Materialized slot tracks — one resolved value per
                        // BOUND slot, keyed by track key. Empty by default.
                        slots: importExceptionSlotValuesFor(row, visible),
                        ...importExceptionCompoundView(row),
                      }}
                      onOpen={() => selectException(row.id)}
                    />
                  ))}
                </>
              )}
              renderRow={(row, _stripe, { columns: visible }) => (
                <CompoundRow
                  key={row.id}
                  data-import-exception-id={row.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={exceptionId === row.id}
                  aria-label={`Missing item number ${row.accountOrderId}`}
                  className="group/row cursor-pointer"
                  onClick={() => selectException(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectException(row.id);
                    }
                  }}
                  columns={visible}
                  capabilities={IMPORT_EXCEPTION_GRID_CAPABILITIES}
                  selected={exceptionId === row.id}
                  view={{
                    slots: importExceptionSlotValuesFor(row, visible),
                    ...importExceptionCompoundView(row),
                  }}
                  onOpen={() => selectException(row.id)}
                />
              )}
            />
          ) : (
            <DataTable<
              CatalogLinkChoreRow,
              CatalogLinkGridColumnKey,
              CatalogLinkGridColumn
            >
              binding={CATALOG_LINK_TABLE_BINDING}
              search={{
                value: query,
                onChange: setQuery,
                placeholder: missingSection ? 'Filter sheet rows…' : 'Filter listings…',
              }}
              tabs={REVIEW_SECTION_TABS}
              activeTab={missingSection ? 'missing-item-number' : undefined}
              onTabChange={(id) =>
                setSection(
                  id === 'missing-item-number' && !missingSection
                    ? 'missing-item-number'
                    : 'catalog-link',
                )
              }
              columns={catalogLinkColumns}
              fields={catalogLinkFields}
              orderGroupsByDate={choreGroups}
              rows={choreRows}
              getRowId={(r) => String(r.id)}
              sort={choreSort.sort}
              dir={choreSort.dir}
              onSortChange={choreSort.setSort}
              loading={chores.isLoading}
              emptyMessage={
                chores.isError
                  ? 'Could not load listings that need a catalog match.'
                  : query.trim() !== ''
                    ? 'No listing matches that search.'
                    : 'Every imported listing already has a catalog SKU.'
              }
              renderGroup={(group, _stripe, { columns: visible }) => (
                <>
                  {group.rows.map((row) => (
                    <CompoundRow
                      key={row.id}
                      data-catalog-link-id={row.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={choreId === row.id}
                      aria-label={`Listing ${row.itemNumber}`}
                      className="group/row cursor-pointer"
                      onClick={() => selectChore(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectChore(row.id);
                        }
                      }}
                      columns={visible}
                      capabilities={CATALOG_LINK_GRID_CAPABILITIES}
                      selected={choreId === row.id}
                      view={{
                        // Materialized slot tracks — one resolved value per
                        // BOUND slot, keyed by track key. Empty by default.
                        slots: catalogLinkSlotValuesFor(row, visible),
                        ...catalogLinkCompoundView(row),
                      }}
                      onOpen={() => selectChore(row.id)}
                    />
                  ))}
                </>
              )}
              renderRow={(row, _stripe, { columns: visible }) => (
                <CompoundRow
                  key={row.id}
                  data-catalog-link-id={row.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={choreId === row.id}
                  aria-label={`Listing ${row.itemNumber}`}
                  className="group/row cursor-pointer"
                  onClick={() => selectChore(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectChore(row.id);
                    }
                  }}
                  columns={visible}
                  capabilities={CATALOG_LINK_GRID_CAPABILITIES}
                  selected={choreId === row.id}
                  view={{
                    slots: catalogLinkSlotValuesFor(row, visible),
                    ...catalogLinkCompoundView(row),
                  }}
                  onOpen={() => selectChore(row.id)}
                />
              )}
            />
          )}

      <CatalogLinkFormRail
        chore={selectedChore}
        onClose={() => selectChore(null)}
        onDone={() => {
          invalidateChores();
          selectChore(null);
        }}
      />
      <ImportExceptionFormRail
        row={selectedException}
        onClose={() => selectException(null)}
        onDone={() => {
          invalidateExceptions();
          invalidateChores();
          selectException(null);
        }}
      />
    </div>
  );
}
