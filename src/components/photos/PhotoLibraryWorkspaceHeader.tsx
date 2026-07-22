'use client';

/**
 * Media Library workbench chrome — dashboard display-header recipe.
 *
 * Left:  recency tabs (Recent · Today · Last 7 · All).
 * Right: search · media type · filters · sort · display controls · NAS.
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
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import {
  photoLibraryShowsGridControls,
  photoLibraryShowsSecondHeaderControls,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import {
  applyRecencyTab,
  PHOTO_LIBRARY_RECENCY_TAB_LABEL,
  PHOTO_LIBRARY_RECENCY_TABS,
  recencyTabFromFilters,
  sourceScopeFromFilters,
  type PhotoLibraryRecencyTab,
  type PhotoLibrarySourceScope,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import {
  buildPhotoLibraryRefinements,
  photoLibraryStructuredFilterCount,
} from '@/lib/photos/library-refinements';
import type { StaffRecipient } from '@/components/quick-access/StaffRecipientList';
import { PhotoDisplayControls } from './PhotoDisplayControls';
import { PhotoLibraryFilterDropdown } from './PhotoLibraryFilterDropdown';
import { PhotoLibraryNasBackup } from './PhotoLibraryNasBackup';
import { PhotoLabelsSection } from './PhotoLabelsSection';
import { PhotoMediaTypeMenu } from './PhotoMediaTypeMenu';
import { PhotoSortMenu } from './PhotoSortMenu';
import { MediaSavedViewsSection } from './MediaSavedViewsSection';

const SEARCH_PLACEHOLDER = 'Filter PO, order, tracking, serial, or ticket…';

export function PhotoLibraryWorkspaceHeader({
  view,
  folderIsLeaf,
  gridDensity,
  onDensityChange,
  onViewChange,
  selectionActive,
  onStartSelect,
  onRefresh,
  isRefreshing,
  className,
}: {
  view: PhotoLibraryViewMode;
  folderIsLeaf: boolean;
  gridDensity: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  onViewChange: (view: PhotoLibraryViewMode) => void;
  selectionActive: boolean;
  onStartSelect: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  className?: string;
}) {
  const { filters, display, patch, setDatePreset, clearStructured, applyView } =
    usePhotoLibraryUrlState();
  const { has } = useAuth();
  const canManagePhotos = has('photos.manage');
  const { photos } = usePhotoLibrary(filters);

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

  const [searchInput, setSearchInput] = useState(filters.poFinder ?? filters.q ?? '');
  const debouncedInput = useDebounce(searchInput, 250);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    setSearchInput(filters.poFinder ?? filters.q ?? '');
  }, [filters.q, filters.poFinder]);

  useEffect(() => {
    const trimmed = debouncedInput.trim();
    if (trimmed === (filters.poFinder ?? '')) return;
    patch({
      poFinder: trimmed || undefined,
      poFinderKind: trimmed ? 'any' : undefined,
      q: undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput]);

  const activeScope = sourceScopeFromFilters(filters);
  const activeTab = recencyTabFromFilters(filters);

  const inferredScope = useMemo<PhotoLibrarySourceScope | null>(() => {
    if (activeScope !== 'all' || !filters.poRef) return null;
    const counts = new Map<PhotoLibrarySourceScope, number>();
    for (const photo of photos) {
      if (photo.sourceScope) counts.set(photo.sourceScope, (counts.get(photo.sourceScope) ?? 0) + 1);
    }
    let best: PhotoLibrarySourceScope | null = null;
    let bestCount = 0;
    for (const [scope, count] of counts) {
      if (count > bestCount) {
        best = scope;
        bestCount = count;
      }
    }
    return best;
  }, [activeScope, filters.poRef, photos]);

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

  const showGridControls = photoLibraryShowsGridControls(view, folderIsLeaf);
  const showSecondHeaderControls = photoLibraryShowsSecondHeaderControls(view, folderIsLeaf);

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
          <PhotoMediaTypeMenu
            activeScope={activeScope}
            activeImageType={filters.imageType ?? null}
            activeDocumentType={filters.documentType ?? 'all'}
            activeOutboundMedia={filters.outboundMedia ?? 'documents'}
            inferredScope={inferredScope}
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

          <PhotoSortMenu
            sort={filters.sort ?? 'recent'}
            onSortChange={(sort) => patch({ sort })}
          />

          <PhotoDisplayControls
            view={view}
            onViewChange={onViewChange}
            density={gridDensity}
            onDensityChange={onDensityChange}
            showToggle={showSecondHeaderControls}
            showDensity={showGridControls}
            showSelect={showSecondHeaderControls}
            selectionActive={selectionActive}
            onStartSelect={onStartSelect}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
          />
        </>
      }
    />
  );
}
