'use client';

/** Media Library card controls — filters, saved views, display controls, and fullscreen. */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import { cornerClass } from '@/design-system/tokens/radius';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import type { MediaViewPayload } from '@/hooks/useMediaLibrarySavedViews';
import {
  countActivePhotoLibraryFilters,
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryFilterState,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import type { PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { cn } from '@/utils/_cn';
import { MediaViewsMenu } from './MediaViewsMenu';
import { PhotoDisplayControls } from './PhotoDisplayControls';
import { PhotoLibraryFilterDropdown } from './PhotoLibraryFilterDropdown';

export function PhotoLibraryFindRow({
  filters,
  view,
  onPatch,
  onApplyView,
  onViewChange,
  density,
  onDensityChange,
  showDensity,
  selectionActive,
  onToggleSelect,
  onRefresh,
  isRefreshing,
  canManageViews,
}: {
  filters: PhotoLibraryFilterState;
  view: PhotoLibraryViewMode;
  onPatch: (partial: Partial<PhotoLibraryFilterState>) => void;
  onApplyView: (payload: MediaViewPayload) => void;
  onViewChange: (view: PhotoLibraryViewMode) => void;
  density: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  showDensity: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canManageViews: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);

  const staffQuery = useQuery({
    queryKey: ['staff', 'active', 'recipients'],
    queryFn: async (): Promise<StaffRecipient[]> => {
      const res = await fetch('/api/staff?active=true');
      if (!res.ok) throw new Error('staff fetch failed');
      const data = (await res.json()) as StaffRecipient[] | { staff?: StaffRecipient[] };
      return Array.isArray(data) ? data : (data.staff ?? []);
    },
    staleTime: 10 * 60 * 1000,
  });
  const staffOptions = staffQuery.data ?? [];

  const activeFilterCount = countActivePhotoLibraryFilters(filters);
  const filterHot =
    activeFilterCount > 0
    || Boolean(filters.stage)
    || Boolean(filters.dateFrom)
    || Boolean(filters.dateTo);

  const savable =
    activeFilterCount > 0
    || Boolean(filters.dateFrom)
    || Boolean(filters.sourceScope && filters.sourceScope !== 'all')
    || Boolean(filters.imageType)
    || view !== DEFAULT_PHOTO_LIBRARY_VIEW;


  return (
    <div
      data-testid="photo-library-find-row"
      className={cn(
        'flex min-w-0 items-center gap-2 border-b border-border-soft bg-surface-card pl-2 pr-0',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >

      <FilterMenu
        open={filterOpen}
        onOpenChange={setFilterOpen}
        hot={filterHot}
        label="Filters"
        hotActiveLabel={
          activeFilterCount > 0
            ? `${activeFilterCount} active`
            : undefined
        }
        contentClassName="w-80 p-3"
      >
        <PhotoLibraryFilterDropdown
          filters={filters}
          onPatch={onPatch}
          onClose={() => setFilterOpen(false)}
          staffOptions={staffOptions}
        />
      </FilterMenu>

      <MediaViewsMenu
        currentFilters={filters}
        currentView={view}
        savable={savable}
        canManage={canManageViews}
        onApply={onApplyView}
      />

      <span className="ml-auto inline-flex shrink-0 items-stretch self-stretch [&>*+*]:-ml-px">
        <PhotoDisplayControls
          view={view}
          onViewChange={onViewChange}
          density={density}
          onDensityChange={onDensityChange}
          showDensity={showDensity}
          selectionActive={selectionActive}
          onToggleSelect={onToggleSelect}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
        <span className={cn('inline-flex items-center px-1', cornerClass('flush'))}>
          <DeskRecordViewSwitch />
        </span>
      </span>
    </div>
  );
}
