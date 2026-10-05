'use client';

/** Media Library card controls — saved views, display controls, and fullscreen. Filters live in the left sidebar (`NAV_PAGE_DECLS['ops-photos']`). */

import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import { cornerClass } from '@/design-system/tokens/radius';
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

export function PhotoLibraryFindRow({
  filters,
  view,
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
  const savable =
    countActivePhotoLibraryFilters(filters) > 0
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
