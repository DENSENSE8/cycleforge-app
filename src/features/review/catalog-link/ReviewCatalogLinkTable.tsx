'use client';

/**
 * Review · Catalog link — listings imported with an Item Number that did not
 * match `sku_catalog` / `sku_platform_ids`, plus the **Missing item number** tab
 * for sheet rows that never became orders (blank Item Number).
 *
 * Composed from the house shells, not hand-rolled:
 *
 *   chrome    → Sheets flush stack (Unbox recipe): Band 1 `WorkbenchChromeHeader`
 *               `density="band"` tabs; Band 3 `WorkbenchTriageBand` (always-open
 *               TechRailSearchBar). No KPI band (no metrics — honest absence).
 *               Column display is the GRID's own top-right header lip, not chrome.
 *   collection→ `NonlinearTableHost` mounted twice (once per binding) — two
 *               column models, one capabilities bag, both on `surface: 'sheet'`
 *   record    → `RightRailHost` (non-modal) via `CatalogLinkFormRail` /
 *               `ImportExceptionFormRail`
 *
 * **The resting split-pane is gone.** This surface used to park a permanent
 * `max-w-md` sibling column beside its list whose resting state was a "Select a
 * listing to link to the catalog" placeholder — a third of the workbench held
 * open to say nothing. The record plane now mounts on the right rail when a row
 * is picked and pushes the grid; when nothing is picked, the grid has the whole
 * width. Both lists moved off their hand-rolled `divide-y` `<ul>`s onto the
 * spreadsheet SoT (`ui-design-system.md` → Hand-rolled table markup).
 *
 * One sticky layer per scroll port: the chrome renders OUTSIDE the body and the
 * grid owns its own Y scroll (`display/workbench.md` → Sticky docking).
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  resolveOptimisticParam,
  shouldClearOptimisticParam,
} from '@/lib/routing/optimistic-url-param';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';
import { CatalogLinkFormRail, ImportExceptionFormRail } from './CatalogLinkFormRail';
import type { RailQueuePosition } from './CatalogLinkFormRail';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  CATALOG_LINK_TABLE_BINDING,
  IMPORT_EXCEPTION_TABLE_BINDING,
} from './grid/catalog-link-table-definition';
import {
  CatalogLinkGridColumnHeader,
  ImportExceptionGridColumnHeader,
} from './grid/CatalogLinkGridColumnHeader';
import { CatalogLinkGridRow, catalogLinkChoreLabel } from './grid/CatalogLinkGridRow';
import { ImportExceptionGridRow, importExceptionLabel } from './grid/ImportExceptionGridRow';
import {
  defaultDirForCatalogLinkGridSort,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
  type CatalogLinkGridColumnKey,
} from './grid/catalog-link-grid-layout';
import {
  defaultDirForImportExceptionGridSort,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
  type ImportExceptionGridColumnKey,
} from './grid/import-exception-grid-layout';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';

type CatalogSel = { choreId: number | null; exceptionId: number | null };

function catalogSelEquals(a: CatalogSel, b: CatalogSel): boolean {
  return a.choreId === b.choreId && a.exceptionId === b.exceptionId;
}

function parsePositiveId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

type CatalogLinkSection = 'catalog-link' | 'missing-item-number';

const SECTION_TABS: Array<{ id: CatalogLinkSection; label: string }> = [
  { id: 'catalog-link', label: 'Needs catalog link' },
  { id: 'missing-item-number', label: 'Missing item number' },
];

function parseSection(raw: string | null): CatalogLinkSection {
  return raw === 'missing-item-number' ? 'missing-item-number' : 'catalog-link';
}

async function fetchChores(q: string): Promise<{ items: CatalogLinkChoreRow[]; total: number }> {
  const params = new URLSearchParams({ limit: '100' });
  if (q.trim()) params.set('q', q.trim());
  const res = await fetch(`/api/review/catalog-link?${params}`, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load catalog-link queue');
  return { items: body.items || [], total: Number(body.total || 0) };
}

async function fetchExceptions(q: string): Promise<{ items: ImportExceptionRow[]; total: number }> {
  const params = new URLSearchParams({ limit: '100' });
  if (q.trim()) params.set('q', q.trim());
  const res = await fetch(`/api/review/import-exceptions?${params}`, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load import exceptions');
  return { items: body.items || [], total: Number(body.total || 0) };
}

/**
 * One-shot "settle" re-render after the grid first has data — the virtualized
 * LedgerGrid mounts its scroll element in the same commit the data arrives, and
 * with no async churn in this subtree its re-measure can miss on first paint.
 */
function useGridSettleTick(loading: boolean, hasRows: boolean) {
  const [, settleTick] = useState(0);
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);
}

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

export function ReviewCatalogLinkTable() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const section = parseSection(searchParams.get('section'));
  const urlSel = useMemo<CatalogSel>(
    () => ({
      choreId: parsePositiveId(searchParams.get('choreId')),
      exceptionId: parsePositiveId(searchParams.get('exceptionId')),
    }),
    [searchParams],
  );
  const [pendingSel, setPendingSel] = useState<CatalogSel | undefined>(undefined);
  useEffect(() => {
    if (shouldClearOptimisticParam(urlSel, pendingSel, catalogSelEquals)) {
      setPendingSel(undefined);
    }
  }, [urlSel, pendingSel]);
  const sel = resolveOptimisticParam(urlSel, pendingSel);
  const selectedChoreId = sel.choreId;
  const selectedExceptionId = sel.exceptionId;
  // No KPI band on this sheet — the controller is the Band-3 controls portal only.
  const chrome = useWorkbenchSheetChrome();
  const controlsEl = chrome.controlsEl;
  // Listing-match / import-exception rows both open a desk peek on the right
  // edge — Band 3's Show / Hide inspector parks whichever is showing.
  const linkFormOpen = useRightRailOccupantOpen('detail:catalog-link');
  const importExceptionOpen = useRightRailOccupantOpen('detail:import-exception');
  const linkInspectorOpen = linkFormOpen || importExceptionOpen;

  const choresQuery = useQuery({
    queryKey: ['review-catalog-link', searchQuery],
    queryFn: () => fetchChores(searchQuery),
    enabled: section === 'catalog-link',
  });

  const exceptionsQuery = useQuery({
    queryKey: ['review-import-exceptions', searchQuery],
    queryFn: () => fetchExceptions(searchQuery),
    enabled: section === 'missing-item-number',
  });

  const choreItems = useMemo(() => choresQuery.data?.items ?? [], [choresQuery.data]);
  const exceptionItems = useMemo(() => exceptionsQuery.data?.items ?? [], [exceptionsQuery.data]);

  const choreIndex = choreItems.findIndex((r) => r.id === selectedChoreId);
  const exceptionIndex = exceptionItems.findIndex((r) => r.id === selectedExceptionId);
  const selectedChore = choreIndex >= 0 ? choreItems[choreIndex] : null;
  const selectedException = exceptionIndex >= 0 ? exceptionItems[exceptionIndex] : null;

  const setParam = useCallback(
    (nextSel: CatalogSel | null, mutate: (params: URLSearchParams) => void) => {
      if (nextSel) setPendingSel(nextSel);
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        mutate(params);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const setSection = useCallback(
    (next: string) => {
      setParam({ choreId: null, exceptionId: null }, (params) => {
        if (next === 'catalog-link') params.delete('section');
        else params.set('section', next);
        params.delete('choreId');
        params.delete('exceptionId');
        params.delete('search');
        // The two tabs have DISJOINT sort vocabularies, and `useUrlColumnSort`'s
        // `isColumn` guard resolves an unknown key to `null` — so a surviving
        // `?colsort=` would render unsorted while the URL claimed a sort.
        params.delete(GRID_COLUMN_SORT_PARAM);
        params.delete(GRID_COLUMN_DIR_PARAM);
      });
    },
    [setParam],
  );

  const openChore = useCallback(
    (id: number) =>
      setParam({ choreId: id, exceptionId: null }, (params) => {
        params.set('choreId', String(id));
        params.delete('exceptionId');
      }),
    [setParam],
  );

  const openException = useCallback(
    (id: number) =>
      setParam({ choreId: null, exceptionId: id }, (params) => {
        params.set('exceptionId', String(id));
        params.delete('choreId');
      }),
    [setParam],
  );

  const clearSelection = useCallback(
    () =>
      setParam({ choreId: null, exceptionId: null }, (params) => {
        params.delete('choreId');
        params.delete('exceptionId');
      }),
    [setParam],
  );

  const setSearch = useCallback(
    (next: string) =>
      setParam({ choreId: null, exceptionId: null }, (params) => {
        const trimmed = next.trim();
        if (trimmed) params.set('search', trimmed);
        else params.delete('search');
        // A row the filter excludes cannot be the open record — the rail would
        // resolve to null anyway, so clear the selection with the query.
        params.delete('choreId');
        params.delete('exceptionId');
      }),
    [setParam],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['review-catalog-link'] });
    void queryClient.invalidateQueries({ queryKey: ['review-import-exceptions'] });
  }, [queryClient]);

  const chorePosition = useMemo<RailQueuePosition | undefined>(() => {
    if (choreIndex < 0) return undefined;
    return {
      index: choreIndex,
      total: choreItems.length,
      onPrev: () => {
        const prev = choreItems[choreIndex - 1];
        if (prev) openChore(prev.id);
      },
      onNext: () => {
        const next = choreItems[choreIndex + 1];
        if (next) openChore(next.id);
      },
    };
  }, [choreIndex, choreItems, openChore]);

  const exceptionPosition = useMemo<RailQueuePosition | undefined>(() => {
    if (exceptionIndex < 0) return undefined;
    return {
      index: exceptionIndex,
      total: exceptionItems.length,
      onPrev: () => {
        const prev = exceptionItems[exceptionIndex - 1];
        if (prev) openException(prev.id);
      },
      onNext: () => {
        const next = exceptionItems[exceptionIndex + 1];
        if (next) openException(next.id);
      },
    };
  }, [exceptionIndex, exceptionItems, openException]);

  const isChoreTab = section === 'catalog-link';
  const isSearching = searchQuery.length > 0;

  // Grid adapters (was `ReviewCatalogLinkGridView`): the table mounts the
  // registry host directly, once per binding. The two tabs have DISJOINT sort
  // vocabularies over one `?colsort=` param — each hook's `isColumn` guard
  // resolves the other tab's key to `null`, and `setSection` clears the param on
  // switch, so the inactive tab's hook never mis-reads a live sort.
  const choreScrollRef = useRef<HTMLDivElement>(null);
  const {
    sort: choreSort,
    dir: choreDir,
    setSort: setChoreSort,
  } = useUrlColumnSort<CatalogLinkGridColumnKey>({
    isColumn: isCatalogLinkGridSortable,
    defaultDir: defaultDirForCatalogLinkGridSort,
  });
  useGridSettleTick(choresQuery.isLoading, choreItems.length > 0);
  const choreGroups = useMemo<[string, RowGroup<CatalogLinkChoreRow>[]][]>(() => {
    const ordered =
      choreSort && choreDir
        ? [...choreItems].sort((a, b) => compareChoreRows(a, b, choreSort, choreDir))
        : choreItems;
    return [['', ordered.map((chore) => ({ key: `chore:${chore.id}`, rows: [chore] }))]];
  }, [choreItems, choreSort, choreDir]);
  const renderChoreLeaf = (chore: CatalogLinkChoreRow, visible: readonly CatalogLinkGridColumn[]) => (
    <CatalogLinkGridRow
      key={chore.id}
      chore={chore}
      isSelected={chore.id === selectedChoreId}
      onOpenChore={openChore}
      columns={visible}
    />
  );

  const exceptionScrollRef = useRef<HTMLDivElement>(null);
  const {
    sort: exceptionSort,
    dir: exceptionDir,
    setSort: setExceptionSort,
  } = useUrlColumnSort<ImportExceptionGridColumnKey>({
    isColumn: isImportExceptionGridSortable,
    defaultDir: defaultDirForImportExceptionGridSort,
  });
  useGridSettleTick(exceptionsQuery.isLoading, exceptionItems.length > 0);
  const exceptionGroups = useMemo<[string, RowGroup<ImportExceptionRow>[]][]>(() => {
    const ordered =
      exceptionSort && exceptionDir
        ? [...exceptionItems].sort((a, b) => compareExceptionRows(a, b, exceptionSort, exceptionDir))
        : exceptionItems;
    return [['', ordered.map((row) => ({ key: `exception:${row.id}`, rows: [row] }))]];
  }, [exceptionItems, exceptionSort, exceptionDir]);
  const renderExceptionLeaf = (
    row: ImportExceptionRow,
    visible: readonly ImportExceptionGridColumn[],
  ) => (
    <ImportExceptionGridRow
      key={row.id}
      row={row}
      isSelected={row.id === selectedExceptionId}
      onOpenException={openException}
      columns={visible}
    />
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full"
        sheetHostClassName="min-h-0"
        tabs={({ className }) => (
          <WorkbenchChromeHeader
            density="band"
            tabs={SECTION_TABS}
            activeTab={section}
            onTabChange={setSection}
            className={className}
            // No trailing cluster. Display sort IS the grid's column sort
            // (`?colsort=`) — a second vocabulary here would break the
            // one-sort-param-per-surface rule — nothing is created by hand
            // (both queues are written by the sheet import), and column
            // display moved to the grid's own top-right lip (2026-08-02).
          />
        )}
        // Band 3 — find. Always-open TechRailSearchBar (filter+paste, not
        // icon-first expand); this is also the first time `?search=` has had a
        // control at all — the old pane's "Clear search" button could only
        // appear for a query no operator could enter.
        triage={({ controlsSlotRef }) => (
          <WorkbenchTriageBand
            controlsSlotRef={controlsSlotRef ?? undefined}
            search={
              <TechRailSearchBar
                variant="chrome"
                value={searchQuery}
                onChange={setSearch}
                placeholder={isChoreTab ? 'Filter listings…' : 'Filter orders…'}
                className="min-w-0 flex-1"
              />
            }
            trailing={
              <WorkbenchInspectorToggle
                open={linkInspectorOpen}
                testId="catalog-link-inspector-toggle"
              />
            }
          />
        )}
      >
        {() => (
          <>
          {isChoreTab ? (
            <NonlinearTableHost<CatalogLinkChoreRow, CatalogLinkGridColumnKey, CatalogLinkGridColumn>
              binding={CATALOG_LINK_TABLE_BINDING}
              orderGroupsByDate={choreGroups}
              rows={choreItems}
              getRowId={(r) => String(r.id)}
              sort={choreSort}
              dir={choreDir}
              onSortChange={setChoreSort}
              loading={choresQuery.isLoading}
              columnTriggerPortalTarget={null}
              // Settled-with-nothing is an ALL-CLEAR on this queue, not an
              // absence — say what it means rather than "no rows".
              emptyMessage="Nothing needs a catalog link right now."
              searchEmptyMessage={`No chore matches “${searchQuery}”. Clear the filter to see the rest.`}
              isSearching={isSearching}
              scrollRef={choreScrollRef}
              renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
                <CatalogLinkGridColumnHeader
                  columns={visible}
                  activeSort={choreSort}
                  sortDir={choreDir}
                  onSortColumn={toggleColumnSort}
                  onResizeColumn={onResizeColumn}
                  onResetColumn={onResetColumn}
                />
              )}
              renderGroup={(group, _stripe, { columns: visible }) => (
                <>{group.rows.map((chore) => renderChoreLeaf(chore, visible))}</>
              )}
              renderRow={(row, _stripe, { columns: visible }) => renderChoreLeaf(row, visible)}
            />
          ) : (
            <NonlinearTableHost<ImportExceptionRow, ImportExceptionGridColumnKey, ImportExceptionGridColumn>
              binding={IMPORT_EXCEPTION_TABLE_BINDING}
              orderGroupsByDate={exceptionGroups}
              rows={exceptionItems}
              getRowId={(r) => String(r.id)}
              sort={exceptionSort}
              dir={exceptionDir}
              onSortChange={setExceptionSort}
              loading={exceptionsQuery.isLoading}
              columnTriggerPortalTarget={null}
              emptyMessage="Every synced sheet row has an Item Number."
              searchEmptyMessage={`No row matches “${searchQuery}”. Clear the filter to see the rest.`}
              isSearching={isSearching}
              scrollRef={exceptionScrollRef}
              renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
                <ImportExceptionGridColumnHeader
                  columns={visible}
                  activeSort={exceptionSort}
                  sortDir={exceptionDir}
                  onSortColumn={toggleColumnSort}
                  onResizeColumn={onResizeColumn}
                  onResetColumn={onResetColumn}
                />
              )}
              renderGroup={(group, _stripe, { columns: visible }) => (
                <>{group.rows.map((row) => renderExceptionLeaf(row, visible))}</>
              )}
              renderRow={(row, _stripe, { columns: visible }) => renderExceptionLeaf(row, visible)}
            />
          )}
          </>
        )}
      </WorkbenchSheetView>

      {/* Record plane — mounted only while a row is picked. Mutually exclusive
          by construction: the two tabs never render together. */}
      <CatalogLinkFormRail
        chore={isChoreTab ? selectedChore : null}
        position={chorePosition}
        onClose={clearSelection}
        onDone={() => {
          clearSelection();
          refresh();
        }}
      />
      <ImportExceptionFormRail
        row={isChoreTab ? null : selectedException}
        position={exceptionPosition}
        onClose={clearSelection}
        onDone={() => {
          clearSelection();
          refresh();
        }}
      />
    </div>
  );
}
