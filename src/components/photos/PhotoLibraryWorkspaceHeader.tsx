'use client';

/**
 * Media Library workbench chrome — dashboard display-header recipe.
 *
 * Refinements only: search · filters · sort · NAS. Everything that answers
 * "WHICH media am I looking at" is NAVIGATION and lives in the resident sidebar
 * rail ({@link PhotoLibrarySidebarPanel}): the lifecycle facets (All · Unboxing
 * · Pickups · Packing · Repair · Claims · Outbound), the org's custom media
 * types, outbound's document sub-filter, and the capture-day drill.
 *
 * **The media-type dropdown was removed from this row (2026-07-29), not
 * relocated twice.** Its built-in half was a byte-for-byte duplicate of the
 * rail's scope list — `BUILTIN_IMAGE_TYPES` keys ARE the source scopes — so two
 * controls wrote `sourceScope` and could disagree. The parts the rail did not
 * already cover (custom types, the add-type action, the outbound document
 * chips) moved INTO the rail rather than being dropped, so nothing became
 * unreachable. Do not reintroduce a scope control here.
 *
 * Density / refresh / select / icons-list stay on the breadcrumb path strip
 * ({@link PhotoLibraryHeader}) — those are in-view photo actions.
 *
 * ## Scoped house-law exception: the search field is always open
 *
 * The DS search SoT is `ToolbarSearchToggle` — collapsed at rest, expanding on
 * hover/focus (`.claude/rules/ui-design-system.md` → Workbench scoped search
 * chrome). **This surface deliberately overrides that**, approved 2026-07-28.
 *
 * Rationale: /ops/photos is a photo-EVIDENCE archive whose #1 job is exact
 * identifier retrieval — pulling the unboxing shots for a specific PO, serial,
 * or claim ticket to settle a damage dispute or carrier claim. On every other
 * workbench, search refines a list the operator is already reading, so
 * collapsed-at-rest correctly demotes it. Here it IS the primary entry path, and
 * a click-to-expand puts a gesture in front of the surface's main job.
 *
 * The rule is principle-based ("is search the entry path or a refinement?").
 * The other known entry-path case is `/search` (global header stays expanded +
 * synced to `?q=`). This file's override stays scoped to Media Library chrome.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { SearchField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  sourceScopeFromFilters,
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
import { PhotoLibraryFilterDropdown } from './PhotoLibraryFilterDropdown';
import { PhotoLibraryNasBackup } from './PhotoLibraryNasBackup';
import { PhotoLabelsSection } from './PhotoLabelsSection';
import { PhotoSortMenu } from './PhotoSortMenu';
import { MediaSavedViewsSection } from './MediaSavedViewsSection';

/**
 * Kept short on purpose. The field is always open (see the exception above) and
 * shares a header row with seven lifecycle tabs, so it is intrinsically narrow —
 * a longer placeholder just truncates mid-word and teaches nothing. The full
 * identifier vocabulary lives in the search field-scope menu.
 */
const SEARCH_PLACEHOLDER = 'PO, order, tracking, serial…';

export function PhotoLibraryWorkspaceHeader({ className }: { className?: string }) {
  const { filters, display, patch, setDatePreset, clearStructured, applyView } =
    usePhotoLibraryUrlState();
  const { has } = useAuth();
  const canManagePhotos = has('photos.manage');

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

  const [searchInput, setSearchInput] = useState(() =>
    photoLibrarySearchFace({ ...filters, sourceScope: activeScope }),
  );
  const debouncedInput = useDebounce(searchInput, 250);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    setSearchInput(photoLibrarySearchFace({ ...filters, sourceScope: activeScope }));
  }, [filters.q, filters.poFinder, filters.ticketId, activeScope]);

  useEffect(() => {
    const trimmed = debouncedInput.trim();
    const current = photoLibrarySearchFace({ ...filters, sourceScope: activeScope });
    if (trimmed === current) return;

    // Under Zendesk Claims, a typed ticket number becomes the ticket leaf filter
    // (photos + NAS archive folder `#9599`) — same waist as ReceivingClaimModal.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput]);

  const refinements = useMemo(
    () =>
      buildPhotoLibraryRefinements(filters, { patch, setDatePreset, clearStructured }, {
        staffNameForId: (id) => staffRows.find((row) => String(row.id) === id)?.name,
      }),
    [clearStructured, filters, patch, setDatePreset, staffRows],
  );

  // Search lives in its own chrome slot — hot the filter glyph on structured only.
  const structuredHot =
    !!filters.staffId ||
    !!filters.label ||
    !!filters.damageDetected ||
    !!filters.hasAnalysis ||
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
    <WorkbenchChromeHeader
      density="band"
      // No tab rail: the seven lifecycle facets moved to the resident sidebar
      // rail (`PhotoLibrarySidebarPanel`) — they are navigation, and they were
      // the reason this row overflowed and clipped its own right controls.
      solidTone="accent"
      className={className}
      search={
        // Always-open by design — see the scoped house-law exception in this
        // file's header comment. Do NOT "fix" this back to ToolbarSearchToggle.
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onClear={() => setSearchInput('')}
          placeholder={SEARCH_PLACEHOLDER}
          tone="blue"
          // Intrinsically sized, and it must SHRINK: WorkbenchChromeHeader's
          // control row is `shrink-0`, so a `w-72` field pushed the row past the
          // viewport and clipped itself (the collapsed ToolbarSearchToggle this
          // replaced was icon-sized, so the row never had to budget for it).
          // `min-w-0` lets it give way before anything overflows.
          className="w-44 min-w-0 xl:w-60"
        />
      }
      right={
        <WorkbenchFilterPopover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          hot={structuredHot}
          label="Media filters"
          contentClassName="w-72 max-h-[min(70vh,28rem)] overflow-y-auto"
        >
          <PhotoLibraryFilterDropdown
            filters={filters}
            onPatch={patch}
            onClose={() => setFilterOpen(false)}
            staffOptions={staffRows}
          />
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
            <MediaSavedViewsSection
              currentFilters={filters}
              currentView={display.view}
              savable={savable}
              canManage={canManagePhotos}
              onApply={(payload) => applyView(payload.filters, payload.view)}
            />
          </div>
          <WorkbenchFilterDivider />
          <div className="px-1 pb-1">
            <PhotoLibraryNasBackup />
          </div>
        </WorkbenchFilterPopover>
      }
      trailing={
        <WorkbenchTrailingCluster
          sort={
            <PhotoSortMenu
              sort={filters.sort ?? 'recent'}
              onSortChange={(sort) => patch({ sort })}
            />
          }
        />
      }
    />
  );
}
