'use client';

/**
 * Media Library **Band 2** — the house lean row, on `WorkbenchTriageBand`.
 *
 * One dominant find field (`min-w-0 flex-1`) with every row-narrowing facet
 * riding *inside* it as ONE refine popover, then the right control cluster:
 * display **order** (`?sort=`), **Views**, and the inspector toggle. That split
 * is the house grammar: a control that changes WHICH rows are on screen goes in
 * the field beside the query it refines; a control that changes how the same
 * rows are laid out — or which named snapshot they came from — stays right.
 *
 * The row is `search · Views · inspector`. There is deliberately **no**
 * `kpiToggle`: this surface has no KPI band, and a toggle with no band behind
 * it is a dead control.
 *
 * ## The 2026-07-29 ban this file used to carry, and why it is lifted
 *
 * This docblock read *"Do not reintroduce a scope control here."* It was earned:
 * a chrome media-type dropdown had shipped whose built-in rows were
 * byte-for-byte the left rail's source scopes, so **two controls wrote
 * `sourceScope` and could disagree**. The fix chosen then was to delete the
 * chrome control and let the rail survive.
 *
 * **Reversed 2026-08-09 — the invariant is kept, the survivor is swapped.** The
 * rail is deleted (`/ops/photos` is rail-less, Pattern E) and the scope control
 * is {@link PhotoLibraryScopeBand} on Band 1, which is now the ONE writer of
 * `sourceScope` / `imageType`. "Exactly one writer" was always the law; "the
 * writer must be a rail" never was. There is still no scope control in THIS
 * file, and there must not be one — but the reason is now "Band 1 owns it", not
 * "the chrome may not own it".
 *
 * ## What arrived here when the rail went away
 *
 * - **Outbound document types** — a facet that narrows the rows, so it rides in
 *   the find field (`trailingSuffix`), not as a chip strip. Outbound-only, the
 *   same conditional the rail carried.
 * - **Capture days** — the breadcrumb (Band 3) already owns date *navigation*;
 *   what the rail uniquely had was per-day COUNTS and a jump to a day off the
 *   current path. That capability moved here rather than being dropped: capture
 *   day is the primary axis of an evidence archive.
 *
 * ## The field is the house one, and it is always open
 *
 * The DS search SoT is `TechRailSearchBar variant="chrome"` — the same
 * always-open field every workbench Band 3 mounts (Unbox History, To-ship,
 * Incoming). This surface mounts it too.
 *
 * It used to mount a bare `SearchField` instead, under an entry-path exception
 * approved 2026-07-28. **That exception was about the field being ALWAYS OPEN,
 * never about it being a different component** — and `variant="chrome"` is
 * always open, so the substance survives and the fork does not. What the fork
 * cost: a hand-rolled `useState` + `useDebounce` pair beside a component that
 * already owns a 250ms draft debounce (stack them and the field lags ~500ms —
 * the header-search regression, one surface over), plus a `px-3` inset that
 * left the field floating inside a band every other surface runs flush.
 *
 * The always-open half is still load-bearing and must not be "fixed" to
 * collapse-at-rest: /ops/photos is a photo-EVIDENCE archive whose #1 job is
 * exact identifier retrieval — pulling the unboxing shots for a specific PO,
 * serial, or claim ticket to settle a damage dispute. On every other workbench
 * search refines a list the operator is already reading; here it IS the entry
 * path, which is also why it earns a band of its own.
 *
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import {
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import { usePhotoInspectorParam } from '@/hooks/usePhotoInspectorParam';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { buildPhotoDateTree } from '@/lib/photos/date-tree';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  OUTBOUND_DOCUMENT_TYPE_LABELS,
  sourceScopeFromFilters,
  type OutboundDocumentTypeFilter,
} from '@/lib/photos/library-filter-state';
import {
  parsePhotoLibraryTicketSearch,
  photoLibrarySearchFace,
} from '@/lib/photos/ticket-search';
import {
  buildPhotoLibraryRefinements,
  photoLibraryStructuredFilterCount,
} from '@/lib/photos/library-refinements';
import type { StaffRecipient } from '@/components/quick-access/StaffRecipientList';
import { cn } from '@/utils/_cn';
import { PhotoLibraryFilterDropdown } from './PhotoLibraryFilterDropdown';
import { PhotoLibraryNasBackup } from './PhotoLibraryNasBackup';
import { PhotoLabelsSection } from './PhotoLabelsSection';
import { PhotoSortMenu } from './PhotoSortMenu';
import { MediaViewsMenu } from './MediaViewsMenu';

/**
 * The field is dominant on its own band now, so the placeholder can carry the
 * whole identifier vocabulary rather than truncating mid-word.
 */
const SEARCH_PLACEHOLDER = 'PO, order, tracking, serial…';

/** The document sub-filter's rows, in the order the deleted chip strip had them. */
const DOCUMENT_OPTIONS: OutboundDocumentTypeFilter[] = ['all', 'shipping_label', 'packing_slip'];

export function PhotoLibraryWorkspaceHeader({ className }: { className?: string }) {
  const { filters, display, patch, setDatePreset, clearStructured, applyView } =
    usePhotoLibraryUrlState();
  const { photoId } = usePhotoInspectorParam();
  const { has } = useAuth();
  const canManagePhotos = has('photos.manage');

  // Same filters → same query key, so this shares the page's cache entry
  // instead of opening a second request for the library. (Carried from the
  // deleted rail, which derived its day tree the same way.)
  const { photos, isSettled, query } = usePhotoLibrary(filters);

  const { data: staffRows = [] } = useQuery<StaffRecipient[]>({
    queryKey: ['staff-picker'],
    queryFn: async () => {
      const res = await fetch('/api/auth/staff-picker', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load staff');
      const data = (await res.json()) as { staff?: StaffRecipient[] };
      return data.staff ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const activeScope = sourceScopeFromFilters(filters);

  const [filterOpen, setFilterOpen] = useState(false);

  /**
   * The field's value IS the URL — `TechRailSearchBar` holds the typing draft
   * and debounces it (250ms) before calling back, so there is no local mirror
   * to keep in sync and no second debounce to stack on top of its own. The
   * `useState` + `useDebounce` + two reconciling effects this replaced were
   * that mirror; one of the effects existed only to undo the drift the other
   * one caused.
   */
  const searchFace = photoLibrarySearchFace({ ...filters, sourceScope: activeScope });

  const commitSearch = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === searchFace) return;

      // Under Zendesk Claims, a typed ticket number becomes the ticket leaf
      // filter (photos + NAS archive folder `#9599`) — same waist as
      // ReceivingClaimModal.
      if (activeScope === 'claims') {
        const ticketDigits = parsePhotoLibraryTicketSearch(trimmed);
        if (ticketDigits) {
          patch({
            ticketId: ticketDigits,
            poFinder: undefined,
            poFinderKind: undefined,
            q: undefined,
            dateFrom: undefined,
            dateTo: undefined,
          });
          return;
        }
        patch({
          ticketId: undefined,
          poFinder: trimmed || undefined,
          poFinderKind: trimmed ? 'ticket' : undefined,
          q: undefined,
          ...(trimmed ? { dateFrom: undefined, dateTo: undefined } : {}),
        });
        return;
      }

      patch({
        poFinder: trimmed || undefined,
        poFinderKind: trimmed ? 'any' : undefined,
        q: undefined,
      });
    },
    [activeScope, patch, searchFace],
  );

  const refinements = useMemo(
    () =>
      buildPhotoLibraryRefinements(filters, { patch, setDatePreset, clearStructured }, {
        staffNameForId: (id) => staffRows.find((row) => String(row.id) === id)?.name,
      }),
    [clearStructured, filters, patch, setDatePreset, staffRows],
  );

  const dateTree = useMemo(() => buildPhotoDateTree(photos), [photos]);
  /** Flat month bands — the popover has no room for a year → month → day nest. */
  const dayGroups = useMemo(
    () =>
      dateTree.flatMap((year) =>
        year.months.map((month) => ({
          key: `${year.year}-${month.key}`,
          // Year prefix only when the loaded stream actually spans more than
          // one — otherwise it repeats a constant on every band.
          label: dateTree.length > 1 ? `${month.label} ${year.year}` : month.label,
          days: month.days,
        })),
      ),
    [dateTree],
  );

  const activeDay =
    filters.dateFrom && filters.dateFrom === filters.dateTo ? filters.dateFrom : null;

  const selectDay = (ymd: string) => {
    setFilterOpen(false);
    patch({
      dateFrom: ymd,
      dateTo: ymd,
      // A day is its own leaf — an entity drill from a different day would
      // contradict it (same clearing the breadcrumb does).
      poRef: undefined,
      ticketId: undefined,
      receivingId: undefined,
    });
  };

  const outboundMedia = filters.outboundMedia ?? 'documents';
  const documentType = filters.documentType ?? 'all';

  // Hot marks the refine glyph while ANY row-narrowing facet is applied — the
  // day drill included, since it is a filter now rather than a rail row.
  const structuredHot =
    !!filters.staffId ||
    !!filters.label ||
    !!filters.damageDetected ||
    !!filters.hasAnalysis ||
    !!activeDay ||
    refinements.length > 0;
  const structuredCount = photoLibraryStructuredFilterCount(filters);

  const savable =
    structuredCount > 0 ||
    !!filters.poFinder ||
    !!filters.q ||
    !!filters.imageType ||
    !!filters.label ||
    (!!filters.sourceScope && filters.sourceScope !== 'all') ||
    display.view !== DEFAULT_PHOTO_LIBRARY_VIEW;

  return (
    <WorkbenchTriageBand
      // Band 2 owns the seam beneath it — the upper band always does (Sheets
      // flush mount recipe: one hairline per seam). `WorkbenchTriageBand`
      // ships `border-r` only because on its home surface the sheet below
      // carries `border-t`; Band 3 here is a path strip, not a sheet.
      // The `pr-0` override this used to carry is gone: `WorkbenchTriageBand`
      // no longer ships a 2px right inset, so every desk gets the aligned right
      // edge this surface had to patch for itself.
      className={cn(className, 'border-b border-border-soft')}
      search={
        // The house Band-3 find field, always open. `variant="chrome"` is
        // `self-stretch` + flush, so it runs edge-to-edge in the band with no
        // inset of its own — do NOT re-add a `px-*` here (this file used to
        // carry `px-3`, which left the field floating inside its own row).
        <TechRailSearchBar
          variant="chrome"
          value={searchFace}
          onChange={commitSearch}
          placeholder={SEARCH_PLACEHOLDER}
          className="min-w-0 flex-1"
          trailingSuffix={
            <WorkbenchFilterPopover
              density="field"
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={structuredHot}
              label="Refine media"
              contentClassName="w-72 max-h-[min(70vh,28rem)] overflow-y-auto"
            >
              {/*
                Outbound's document sub-filter exists only under that scope, so
                it rides beneath the tab that turns it on — the same conditional
                the rail carried, now as menu rows rather than a soft chip strip.
              */}
              {activeScope === 'outbound' ? (
                <div data-testid="photo-document-types">
                  <WorkbenchFilterGroupLabel>Document type</WorkbenchFilterGroupLabel>
                  {DOCUMENT_OPTIONS.map((option) => (
                    <WorkbenchFilterMenuRow
                      key={option}
                      label={OUTBOUND_DOCUMENT_TYPE_LABELS[option]}
                      active={outboundMedia === 'documents' && documentType === option}
                      onClick={() => patch({ documentType: option, outboundMedia: 'documents' })}
                    />
                  ))}
                  <WorkbenchFilterMenuRow
                    label={OUTBOUND_DOCUMENT_TYPE_LABELS.pack_photos}
                    active={outboundMedia === 'pack_photos'}
                    onClick={() =>
                      patch({ outboundMedia: 'pack_photos', documentType: undefined })
                    }
                  />
                  <WorkbenchFilterDivider />
                </div>
              ) : null}

              <div data-testid="photo-capture-days">
              <WorkbenchFilterGroupLabel>Capture days</WorkbenchFilterGroupLabel>
              {dayGroups.length === 0 ? (
                /*
                  Three states, three answers — the tree derives from the loaded
                  stream, so an unloaded stream and an empty archive look
                  identical in `photos` and must NOT read the same. Before this
                  split the rail printed "No photos in view" while the first page
                  was still in flight, and again when the library endpoint was
                  500ing: both said the archive was empty.

                  `failureCount` too, not just `isError`: a query with no data is
                  stale by definition, so `refetchOnWindowFocus` (Providers.tsx)
                  flips it back to `pending` on every focus no matter what
                  `staleTime` says. During a real outage `isError` is therefore
                  false at most sampled moments and this would spin forever. A
                  fetch that has failed at least once is an error to the operator
                  either way.
                */
                query.isError || query.failureCount > 0 ? (
                  <p className="px-2.5 py-1.5 text-role-caption text-text-danger">
                    Could not load capture days.
                  </p>
                ) : isSettled ? (
                  <p className="px-2.5 py-1.5 text-role-caption text-text-soft">
                    No photos in view.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 px-2.5 py-1.5 text-role-caption text-text-soft">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </p>
                )
              ) : (
                dayGroups.map((group) => (
                  <div key={group.key}>
                    <p className="px-2.5 pb-0.5 pt-1 text-role-micro uppercase tracking-widest text-text-soft">
                      {group.label}
                    </p>
                    {group.days.map((day) => (
                      <WorkbenchFilterMenuRow
                        key={day.ymd}
                        label={day.dayLabel}
                        count={day.count}
                        active={activeDay === day.ymd}
                        onClick={() => selectDay(day.ymd)}
                      />
                    ))}
                  </div>
                ))
              )}
              </div>

              <WorkbenchFilterDivider />
              <div className="px-1 pb-1 pt-1">
                <PhotoLibraryFilterDropdown
                  filters={filters}
                  onPatch={patch}
                  onClose={() => setFilterOpen(false)}
                  staffOptions={staffRows}
                />
              </div>
              <WorkbenchFilterDivider />
              <WorkbenchFilterGroupLabel>Labels</WorkbenchFilterGroupLabel>
              <div className="px-1 pb-1">
                <PhotoLabelsSection
                  activeLabel={filters.label ?? null}
                  scopeImageType={filters.imageType}
                  onSelect={(label) => patch({ label })}
                />
              </div>
              <WorkbenchFilterDivider />
              <div className="px-1 pb-1">
                <PhotoLibraryNasBackup />
              </div>
            </WorkbenchFilterPopover>
          }
        />
      }
      // Saved views are a page-scoped CONTROL, not a row-narrowing facet, so
      // they left the refine funnel for the band's own `views` slot
      // (2026-08-10) — same ruling that moved Views out of the find group
      // house-wide. `MediaViewsMenu` keeps this surface's own store
      // (`useMediaLibrarySavedViews`, a JSON snapshot rather than URL params)
      // and composes the shared Bookmark face.
      views={
        <MediaViewsMenu
          currentFilters={filters}
          currentView={display.view}
          savable={savable}
          canManage={canManagePhotos}
          onApply={(payload) => applyView(payload.filters, payload.view)}
        />
      }
      // No `kpiToggle`: this surface has no KPI band. Honest absence — never
      // mount one to make the row look symmetrical.
      trailing={
        <WorkbenchTrailingCluster
          divide={false}
          sort={
            <PhotoSortMenu
              sort={filters.sort ?? 'recent'}
              onSortChange={(sort) => patch({ sort })}
            />
          }
          after={
            <WorkbenchInspectorToggle
              open={Boolean(photoId)}
              testId="media-library-inspector-toggle"
            />
          }
        />
      }
    />
  );
}
