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
 *   collection→ `LedgerGridSurface` + a `GridSurfaceDescriptor`, via
 *               `ReviewCatalogLinkGridView` — two column models, one bag
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

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { cn } from '@/utils/_cn';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';
import { CatalogLinkFormRail, ImportExceptionFormRail } from './CatalogLinkFormRail';
import type { RailQueuePosition } from './CatalogLinkFormRail';
import { CatalogLinkChoresGrid, ImportExceptionsGrid } from './grid/ReviewCatalogLinkGridView';
import {
} from './grid/catalog-link-grid-layout';
import {
} from './grid/import-exception-grid-layout';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';

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

export function ReviewCatalogLinkTable() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const section = parseSection(searchParams.get('section'));
  const selectedChoreId = Number(searchParams.get('choreId')) || null;
  const selectedExceptionId = Number(searchParams.get('exceptionId')) || null;
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

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
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSection = useCallback(
    (next: string) => {
      setParam((params) => {
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
      setParam((params) => {
        params.set('choreId', String(id));
        params.delete('exceptionId');
      }),
    [setParam],
  );

  const openException = useCallback(
    (id: number) =>
      setParam((params) => {
        params.set('exceptionId', String(id));
        params.delete('choreId');
      }),
    [setParam],
  );

  const clearSelection = useCallback(
    () =>
      setParam((params) => {
        params.delete('choreId');
        params.delete('exceptionId');
      }),
    [setParam],
  );

  const setSearch = useCallback(
    (next: string) =>
      setParam((params) => {
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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <DashboardScrollShell
        className="h-full"
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <WorkbenchChromeHeader
              density="band"
              tabs={SECTION_TABS}
              activeTab={section}
              onTabChange={setSection}
              className="rounded-none border-l-0 border-t-0 shadow-sm"
              // No trailing cluster. Display sort IS the grid's column sort
              // (`?colsort=`) — a second vocabulary here would break the
              // one-sort-param-per-surface rule — nothing is created by hand
              // (both queues are written by the sheet import), and column
              // display moved to the grid's own top-right lip (2026-08-02).
            />
            {/* Band 3 — find. Always-open TechRailSearchBar (filter+paste, not
                icon-first expand); this is also the first time `?search=` has had
                a control at all — the old pane's "Clear search" button could only
                appear for a query no operator could enter. */}
            <WorkbenchTriageBand
              controlsSlotRef={setControlsEl}
              search={
                <TechRailSearchBar
                  variant="chrome"
                  value={searchQuery}
                  onChange={setSearch}
                  placeholder={isChoreTab ? 'Filter listings…' : 'Filter orders…'}
                  className="w-40 shrink-0 lg:w-56"
                />
              }
            />
          </div>
        }
      >
        <div className={cn(WORKBENCH_SHEET_HOST, 'min-h-0')}>
          {isChoreTab ? (
            <CatalogLinkChoresGrid
              rows={choreItems}
              loading={choresQuery.isLoading}
              columnTriggerPortalTarget={controlsEl}
              // Settled-with-nothing is an ALL-CLEAR on this queue, not an
              // absence — say what it means rather than "no rows".
              emptyMessage="Nothing needs a catalog link right now."
              searchEmptyMessage={`No chore matches “${searchQuery}”. Clear the filter to see the rest.`}
              isSearching={isSearching}
              selectedChoreId={selectedChoreId}
              onOpenChore={openChore}
            />
          ) : (
            <ImportExceptionsGrid
              rows={exceptionItems}
              loading={exceptionsQuery.isLoading}
              columnTriggerPortalTarget={controlsEl}
              emptyMessage="Every synced sheet row has an Item Number."
              searchEmptyMessage={`No row matches “${searchQuery}”. Clear the filter to see the rest.`}
              isSearching={isSearching}
              selectedExceptionId={selectedExceptionId}
              onOpenException={openException}
            />
          )}
        </div>
      </DashboardScrollShell>

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
