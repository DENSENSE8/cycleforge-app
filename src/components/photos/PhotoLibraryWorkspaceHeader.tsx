'use client';

/**
 * Media Library workbench chrome — dashboard display-header recipe.
 *
 * Left:  recency tabs (Recent · Today · Last 7 · All).
 * Right: search · filters · media type · sort · NAS.
 *
 * Density / refresh / select / icons-list stay on the breadcrumb path strip
 * ({@link PhotoLibraryHeader}) — those are in-folder photo actions.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import {
  applyRecencyTab,
  PHOTO_LIBRARY_RECENCY_TAB_LABEL,
  PHOTO_LIBRARY_RECENCY_TABS,
  recencyTabFromFilters,
  sourceScopeFromFilters,
  type PhotoLibraryRecencyTab,
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
import { PhotoMediaTypeMenu } from './PhotoMediaTypeMenu';
import { PhotoSortMenu } from './PhotoSortMenu';
import { MediaSavedViewsSection } from './MediaSavedViewsSection';

const SEARCH_PLACEHOLDER = 'Filter PO, order, tracking, serial, or ticket…';

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
  const activeTab = recencyTabFromFilters(filters);

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

  const tabs = PHOTO_LIBRARY_RECENCY_TABS.map((id: PhotoLibraryRecencyTab) => ({
    id,
    label: PHOTO_LIBRARY_RECENCY_TAB_LABEL[id],
    color: (id === 'recent' ? 'blue' : id === 'today' ? 'orange' : 'emerald') as
      | 'blue'
      | 'orange'
      | 'emerald',
  }));

  const savable =
    structuredCount > 0 ||
    !!filters.poFinder ||
    !!filters.q ||
    !!filters.imageType ||
    !!filters.label ||
    (!!filters.sourceScope && filters.sourceScope !== 'all') ||
    display.view !== 'folders';

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => patch(applyRecencyTab(id as PhotoLibraryRecencyTab))}
      solidTone="accent"
      className={className}
      search={
        <ToolbarSearchToggle
          value={searchInput}
          onChange={setSearchInput}
          onClear={() => setSearchInput('')}
          placeholder={SEARCH_PLACEHOLDER}
          tone="blue"
        />
      }
      right={
        <>
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

          <PhotoMediaTypeMenu
            activeScope={activeScope}
            activeImageType={filters.imageType ?? null}
            activeDocumentType={filters.documentType ?? 'all'}
            activeOutboundMedia={filters.outboundMedia ?? 'documents'}
            inferredScope={null}
            onSelect={({ scope, imageType }) =>
              patch({
                sourceScope: scope,
                imageType,
                documentType: scope === 'outbound' ? filters.documentType ?? 'all' : undefined,
                outboundMedia: scope === 'outbound' ? filters.outboundMedia ?? 'documents' : undefined,
                poRef: undefined,
                label: undefined,
              })
            }
            onDocumentTypeSelect={(documentType) =>
              patch({ documentType, outboundMedia: 'documents' })
            }
            onPackPhotosSelect={() =>
              patch({ outboundMedia: 'pack_photos', documentType: undefined })
            }
          />

          <PhotoSortMenu
            sort={filters.sort ?? 'recent'}
            onSortChange={(sort) => patch({ sort })}
          />
        </>
      }
    />
  );
}
