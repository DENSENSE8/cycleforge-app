'use client';

/** Media Library **Views** — the Band-3 saved-views control for `/ops/photos`. */

import { useState } from 'react';
import { ViewsMenuShell } from '@/components/saved-views/WorkbenchViewsMenu';
import type { MediaViewPayload } from '@/hooks/useMediaLibrarySavedViews';
import type {
  PhotoLibraryFilterState,
  PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { MediaSavedViewsSection } from './MediaSavedViewsSection';

export function MediaViewsMenu({
  currentFilters,
  currentView,
  savable,
  canManage,
  onApply,
}: {
  currentFilters: PhotoLibraryFilterState;
  currentView: PhotoLibraryViewMode;
  /** The current state is worth naming (a filter is applied, or a non-default view). */
  savable: boolean;
  /** Org-wide sharing needs `photos.manage`. */
  canManage: boolean;
  onApply: (payload: MediaViewPayload) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ViewsMenuShell
      open={open}
      tip="Views"
      active={false}
      onToggle={() => setOpen((o) => !o)}
      onClose={() => setOpen(false)}
    >
      <MediaSavedViewsSection
        currentFilters={currentFilters}
        currentView={currentView}
        savable={savable}
        canManage={canManage}
        onApply={(payload) => {
          onApply(payload);
          setOpen(false);
        }}
        // The section used to render nothing when there was neither a view nor anything to save — correct while it was one block inside a shared…
        emptyHint="No saved views yet — filter the archive (scope, capture day, staff, label), then save it here."
      />
    </ViewsMenuShell>
  );
}
