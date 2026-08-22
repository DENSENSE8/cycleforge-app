'use client';

/**
 * Media Library **Views** — the Band-3 saved-views control for `/ops/photos`.
 *
 * A thin adapter: it owns the Media store and composes the house
 * {@link ViewsMenuShell} face, so the Bookmark trigger, its tooltip and the
 * panel are byte-identical to every other ops-queue desk.
 *
 * **Why it cannot compose `WorkbenchViewsMenu`.** That component resolves its
 * views through `useSavedViews`, whose whole model is "a named set of URL
 * params on this surface". A Media view is a JSON `{filters, view}` snapshot
 * persisted through `useMediaLibrarySavedViews` and applied by rewriting the
 * URL state wholesale — there is no `paramKeys` list to hand it. Three client
 * hooks over ONE `saved_views` table is the standing ruling
 * (source-of-truth.md → Tabs vs. saved views); what must never be duplicated is
 * the storage, the apply-to-URL logic, and — this file's reason to exist — the
 * face.
 *
 * **It claims no active view, on purpose.** Applying writes the snapshot into
 * the URL and keeps no identity, so this surface genuinely cannot say which
 * view is showing. Deep-comparing the current filters against each payload
 * would answer it, and would answer it *wrongly* on the first normalization
 * mismatch — a false "active" is chrome inventing a second story, which is
 * worse than an honest silence. The trigger lights while the menu is open and
 * not otherwise.
 *
 */

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
        // The section used to render nothing when there was neither a view nor
        // anything to save — correct while it was one block inside a shared
        // refine funnel, and wrong now that it is the whole body of its own
        // menu: the operator would open Views onto an empty panel.
        emptyHint="No saved views yet — filter the archive (scope, capture day, staff, label), then save it here."
      />
    </ViewsMenuShell>
  );
}
