'use client';

import { useState, useMemo } from 'react';
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { useImageTypes } from '@/hooks/useImageTypes';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SidebarSectionList } from '@/components/sidebar/SidebarSectionList';
import { Folder, Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { toast } from '@/lib/toast';
import { buildPhotoDateTree } from '@/lib/photos/date-tree';
import { PHOTO_SCOPE_ICONS } from '@/lib/photos/scope-icons';
import { OutboundDocumentTypeFilters } from './OutboundDocumentTypeFilters';
import { BUILTIN_IMAGE_TYPE_KEYS } from '@/lib/photos/image-type-defs';
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
 * It holds everything that answers **which media am I looking at** — the
 * lifecycle scope that produced it, the org's own media types, and the day it
 * was captured. Everything that *refines* the resulting set (search, structured
 * filters, sort, saved views, NAS backup) stays in the workbench chrome header:
 * refinements belong with the result they narrow, and splitting them across two
 * homes is what the previous, deleted photo sidebar got wrong.
 *
 * **This rail is the ONLY writer of `sourceScope` / `imageType` (2026-07-29).**
 * The chrome header's media-type dropdown wrote the same params from a second
 * place — its built-in rows were the same six source scopes — so the two could
 * disagree about what the operator had selected. It was deleted, and the parts
 * it uniquely owned (custom types + add, outbound's document chips) live here
 * now. Adding a scope control back to the header re-opens that split.
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
  const { custom, isLoading: typesLoading, createType } = useImageTypes();
  const [addingType, setAddingType] = useState(false);

  const scopeSections = useMemo(
    () => [
      ...PHOTO_LIBRARY_SCOPE_TABS.map((id: PhotoLibrarySourceScope) => {
        // Paired glyph + label — never a bare icon (ui-design-system.md → Icons).
        const Icon = PHOTO_SCOPE_ICONS[id];
        return {
          id: id as string,
          label: PHOTO_SOURCE_SCOPE_LABELS[id],
          icon: <Icon className="h-3.5 w-3.5" />,
        };
      }),
      // The org's own media types, in the SAME list as the built-ins: both
      // answer "which media am I looking at", and the header menu that used to
      // hold them is gone. They are a second GROUP, not a second control —
      // built-ins are lifecycle-derived, custom ones are operator-defined.
      ...custom.map((type) => ({
        id: type.key,
        label: type.label,
        group: 'Custom types',
        icon: <Folder className="h-3.5 w-3.5" />,
      })),
    ],
    [custom],
  );

  // One row is active at a time across BOTH groups: a custom type clears the
  // lifecycle scope and vice versa (the media-type menu behaved this way too).
  const activeSection = filters.imageType ?? activeScope;

  const selectSection = (id: string) => {
    if (id === 'all' || BUILTIN_IMAGE_TYPE_KEYS.has(id)) {
      patch(applySourceScopeTab(id as PhotoLibrarySourceScope));
      return;
    }
    patch({
      imageType: id,
      // Same clears the menu did: a custom type is its own scope, so no
      // lifecycle-derived refinement survives the switch.
      sourceScope: undefined,
      stage: undefined,
      label: undefined,
      poRef: undefined,
      ticketId: undefined,
      receivingId: undefined,
      documentType: undefined,
      outboundMedia: undefined,
    });
  };

  const addType = async () => {
    const label = window.prompt('New media type name')?.trim();
    if (!label) return;
    setAddingType(true);
    try {
      const created = await createType.mutateAsync({ label });
      selectSection(created.key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create media type');
    } finally {
      setAddingType(false);
    }
  };

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
          <div className="flex items-center justify-between gap-2 px-1.5 pt-2">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Sources</p>
            <HoverTooltip label="Add media type" asChild>
              <IconButton
                size="xs"
                icon={
                  addingType ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )
                }
                ariaLabel="Add media type"
                onClick={() => void addType()}
                disabled={addingType}
                // Bleed the hit box so the affordance never grows the eyebrow row.
                className="-my-1"
              />
            </HoverTooltip>
          </div>
          <SidebarSectionList
            sections={scopeSections}
            active={activeSection}
            onSelect={selectSection}
            ariaLabel="Media scope"
            // A navigator beside a working surface, not a settings page — house
            // one-row anatomy and ring selection (see the prop's contract).
            density="ops"
          />
          {typesLoading && custom.length === 0 ? (
            <p className="flex items-center gap-2 px-1.5 py-1.5 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading types…
            </p>
          ) : null}
          {/* Outbound's document sub-filter only exists under that scope, so it
              rides beneath the row that turns it on — the same conditional the
              media-type menu carried, moved with the rest of it. */}
          {activeScope === 'outbound' ? (
            <div className="border-t border-border-hairline py-2">
              <OutboundDocumentTypeFilters
                documentType={filters.documentType ?? 'all'}
                outboundMedia={filters.outboundMedia ?? 'documents'}
                onSelectDocumentType={(documentType) =>
                  patch({ documentType, outboundMedia: 'documents' })
                }
                onSelectPackPhotos={() =>
                  patch({ outboundMedia: 'pack_photos', documentType: undefined })
                }
              />
            </div>
          ) : null}
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
