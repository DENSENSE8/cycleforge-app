'use client';

import { useMemo } from 'react';
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SidebarSectionList } from '@/components/sidebar/SidebarSectionList';
import { Loader2 } from '@/components/Icons';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { buildPhotoDateTree } from '@/lib/photos/date-tree';
import { PHOTO_SCOPE_ICONS } from '@/lib/photos/scope-icons';
import {
  applySourceScopeTab,
  PHOTO_LIBRARY_SCOPE_TABS,
  PHOTO_SOURCE_SCOPE_LABELS,
  sourceScopeFromFilters,
  type PhotoLibrarySourceScope,
} from '@/lib/photos/library-filter-state';
import { cn } from '@/utils/_cn';

/**
 * Media Library facet rail — the route's OWN sidebar, resident in the spine.
 *
 * This is the column `SidebarShell`'s contract already named ("the Media
 * library's facet rail") and the surface never had: `/ops/photos` was the one
 * desktop route that reserved nothing, so the page ran edge-to-edge and the
 * transient page-list spine painted straight over the photo grid instead of
 * landing on a reserved column like it does everywhere else.
 *
 * It holds the two NAVIGATIONAL facets — which lifecycle produced the media, and
 * which day it was captured. Everything that *refines* the resulting set (search,
 * structured filters, media type, sort, saved views, NAS backup) stays in the
 * workbench chrome header: refinements belong with the result they narrow, and
 * splitting them across two homes is what the previous, deleted photo sidebar
 * got wrong.
 *
 * The date tree is derived from the LOADED page stream (`buildPhotoDateTree`),
 * so it describes what is actually in view rather than promising a full-archive
 * index the infinite-scroll query has not fetched.
 */
export function PhotoLibrarySidebarPanel() {
  const { filters, patch } = usePhotoLibraryUrlState();
  // Same filters → same query key, so this shares the page's cache entry
  // instead of opening a second request for the library.
  const { photos, isSettled, query } = usePhotoLibrary(filters);

  const activeScope = sourceScopeFromFilters(filters);

  const scopeSections = useMemo(
    () =>
      PHOTO_LIBRARY_SCOPE_TABS.map((id: PhotoLibrarySourceScope) => {
        // Paired glyph + label — never a bare icon (ui-design-system.md → Icons).
        const Icon = PHOTO_SCOPE_ICONS[id];
        return {
          id,
          label: PHOTO_SOURCE_SCOPE_LABELS[id],
          icon: <Icon className="h-3.5 w-3.5" />,
        };
      }),
    [],
  );

  const dateTree = useMemo(() => buildPhotoDateTree(photos), [photos]);

  // The year band earns its row only when the loaded stream actually spans more
  // than one — otherwise `2026 › JULY › Jul 28` spends two of three levels
  // saying nothing, which is the DEFAULT state (one day loaded).
  const showYearBand = dateTree.length > 1;

  const activeDay =
    filters.dateFrom && filters.dateFrom === filters.dateTo ? filters.dateFrom : null;

  const selectDay = (ymd: string) =>
    patch({
      dateFrom: ymd,
      dateTo: ymd,
      // A day is its own leaf — an entity drill from a different day would
      // contradict it (same clearing the breadcrumb does).
      poRef: undefined,
      ticketId: undefined,
      receivingId: undefined,
    });

  return (
    <SidebarShell
      className="bg-surface-card"
      headerAbove={
        <div className="shrink-0 border-b border-border-hairline">
          <p className="px-1.5 pt-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
            Sources
          </p>
          <SidebarSectionList
            sections={scopeSections}
            active={activeScope}
            onSelect={(id) => patch(applySourceScopeTab(id as PhotoLibrarySourceScope))}
            ariaLabel="Media scope"
            // A navigator beside a working surface, not a settings page — house
            // one-row anatomy and ring selection (see the prop's contract).
            density="ops"
          />
        </div>
      }
      bodyClassName="pb-4"
    >
      <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
        Capture days
      </p>
      {dateTree.length === 0 ? (
        // Three states, three answers — the tree derives from the loaded stream,
        // so an unloaded stream and an empty archive look identical in `photos`
        // and must NOT read the same. Before this split the rail printed "No
        // photos in view" while the first page was still in flight, and again
        // when the library endpoint was 500ing: both said the archive was empty.
        // `failureCount` too, not just `isError`: with `refetchOnWindowFocus:
        // 'always'` (Providers.tsx) a query with no data flips back to `pending`
        // on every focus, so during a real outage `isError` is false at most
        // sampled moments and the rail would spin forever. A fetch that has
        // failed at least once is an error to the operator either way.
        query.isError || query.failureCount > 0 ? (
          <p className="text-role-caption text-text-danger">
            Could not load capture days.
          </p>
        ) : isSettled ? (
          <p className="text-role-caption text-text-soft">No photos in view.</p>
        ) : (
          <p className="flex items-center gap-2 text-role-caption text-text-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        )
      ) : (
        <div className="space-y-3">
          {dateTree.map((year) => (
            <div key={year.year}>
              {showYearBand && (
                <p className="text-role-micro uppercase tracking-widest text-text-faint">
                  {year.year}
                </p>
              )}
              <div className={cn('space-y-2', showYearBand && 'mt-1')}>
                {year.months.map((month) => (
                  <div key={month.key}>
                    <p className="text-role-micro uppercase tracking-widest text-text-soft">
                      {month.label}
                    </p>
                    <ul className="mt-0.5">
                      {month.days.map((day) => {
                        const isActive = activeDay === day.ymd;
                        return (
                          <li key={day.ymd}>
                            <button
                              type="button"
                              onClick={() => selectDay(day.ymd)}
                              aria-current={isActive ? 'true' : undefined}
                              className={cn(
                                'ds-raw-button flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition',
                                // Same selection token the scope rows above use
                                // — one card must not hold two selection languages.
                                isActive ? QUEUE_ROW.selectedClass : 'hover:bg-surface-hover',
                              )}
                            >
                              <span className="truncate text-role-caption font-semibold text-text-default">
                                {day.dayLabel}
                              </span>
                              <span className="ml-auto shrink-0 text-role-micro uppercase tracking-widest text-text-soft">
                                {day.count}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SidebarShell>
  );
}
