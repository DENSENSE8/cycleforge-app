'use client';

/**
 * Media Library display row — grid size, refresh and the Icons | List switch.
 * Filters, sort and saved views live in the left sidebar
 * (`NAV_PAGE_DECLS['ops-photos']`); Media opens no record pane, so it has no
 * In place | Split switch.
 */

import type { PhotoLibraryViewMode } from '@/lib/photos/library-filter-state';
import type { PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { cn } from '@/utils/_cn';
import { PhotoDisplayControls } from './PhotoDisplayControls';

/** 32px switches (28px faces in a 2px well) + 4px above and below: the row grows to fit, never clips. */
const FIND_ROW_PADDING = 'shrink-0 px-2 py-1';

export function PhotoLibraryFindRow({
  view,
  onViewChange,
  density,
  onDensityChange,
  showDensity,
  onRefresh,
  isRefreshing,
}: {
  view: PhotoLibraryViewMode;
  onViewChange: (view: PhotoLibraryViewMode) => void;
  density: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  showDensity: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div
      data-testid="photo-library-find-row"
      className={cn(
        'flex min-w-0 items-center justify-end gap-2 border-b border-border-soft bg-surface-card',
        FIND_ROW_PADDING,
      )}
    >
      <PhotoDisplayControls
        view={view}
        onViewChange={onViewChange}
        density={density}
        onDensityChange={onDensityChange}
        showDensity={showDensity}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}
