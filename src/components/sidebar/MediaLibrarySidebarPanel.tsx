'use client';

/**
 * Media Library sidebar — the `/ops/photos` facet rail.
 *
 * Thin composition layer, in the shape of {@link ReceivingSidebarPanel}: it
 * fetches nothing and computes nothing, it wires the URL filter state to
 * presentational sections that already exist.
 *
 * ## Why this route grew a spine body
 *
 * `SidebarContextPanel` returned `null` for `ops-photos`, recorded as "media
 * library owns its whole context in the workbench chrome header … so it has no
 * spine body." That was a *nothing-to-put-there* observation, not a rule that the
 * column must stay empty — and it stopped being true once the folder hierarchy
 * was replaced by a faceted flat stream, which needs somewhere durable to park
 * saved views and label facets.
 *
 * ## Division of labour with the chrome header — no two shapes for one job
 *
 * The research ruling put lifecycle facets in the top tabs (Q3) *and* source
 * scopes in this rail (Q4). Doing both would leave **two controls for one job**,
 * which house law bans outright. The split:
 *
 *   - **Lifecycle facet** (All · Unboxing · Pickups · …) → the chrome TABS.
 *     One primary axis, always visible, exactly where Q3 put it.
 *   - **Date** → this rail. The recency tabs (Recent · Today · Last 7) lost their
 *     slot when tabs became lifecycle; date is a *filter*, so it lands here
 *     rather than being deleted outright.
 *   - **Saved views** → this rail, promoted out of the filter popover where they
 *     were effectively undiscoverable. This is the operator-change-aversion
 *     mitigation and it ships WITH the flat stream, not after: anyone who wants
 *     their old date-drilled workflow can save it as a one-click view.
 *   - **Labels** → this rail (a browse facet, not a refinement of a visible list).
 *   - **Identifier search** → the chrome header's always-open field.
 *
 * Structured refinements (staff, damage, analysis) deliberately stay in the
 * filter popover — they refine a result set rather than navigate to one.
 */

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { MediaSavedViewsSection } from '@/components/photos/MediaSavedViewsSection';
import { PhotoLabelsSection } from '@/components/photos/PhotoLabelsSection';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import {
  datePresetFromFilters,
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryDatePreset,
} from '@/lib/photos/library-filter-state';
import { photoLibraryStructuredFilterCount } from '@/lib/photos/library-refinements';
import { cn } from '@/utils/_cn';

/** Date shortcuts — the recency tabs' new home now that the tab strip is lifecycle. */
const DATE_PRESETS: ReadonlyArray<{ id: PhotoLibraryDatePreset; label: string }> = [
  { id: 'all', label: 'All dates' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
];

function SidebarSectionHeading({ children }: { children: React.ReactNode }) {
  // House eyebrow — the role bakes 600 + the condensed cut, so no weight class.
  return (
    <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">{children}</p>
  );
}

export function MediaLibrarySidebarPanel() {
  const { filters, display, patch, setDatePreset, applyView } = usePhotoLibraryUrlState();
  const { has } = useAuth();
  const canManagePhotos = has('photos.manage');

  const activePreset = datePresetFromFilters(filters);

  const savable =
    photoLibraryStructuredFilterCount(filters) > 0 ||
    !!filters.poFinder ||
    !!filters.q ||
    !!filters.imageType ||
    !!filters.label ||
    (!!filters.sourceScope && filters.sourceScope !== 'all') ||
    display.view !== DEFAULT_PHOTO_LIBRARY_VIEW;

  const onSelectLabel = useCallback(
    (label: string | undefined) => patch({ label }),
    [patch],
  );

  return (
    <SidebarShell bodyClassName="stack-section pb-6">
      <section>
        <SidebarSectionHeading>Saved views</SidebarSectionHeading>
        <MediaSavedViewsSection
          currentFilters={filters}
          currentView={display.view}
          savable={savable}
          canManage={canManagePhotos}
          onApply={(payload) => applyView(payload.filters, payload.view)}
        />
      </section>

      <section>
        <SidebarSectionHeading>Date</SidebarSectionHeading>
        <div className="flex flex-wrap row-gap-tight">
          {DATE_PRESETS.map(({ id, label }) => {
            const active = activePreset === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setDatePreset(id)}
                className={cn(
                  'ds-raw-button rounded inset-chip text-role-micro uppercase tracking-widest ring-1 ring-inset transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 ring-blue-200'
                    : 'text-text-soft ring-border-soft hover:bg-surface-sunken',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* A hand-picked range (a breadcrumb jump, a saved view) matches no preset
            — say so rather than leaving every chip dark and unexplained. */}
        {activePreset === 'custom' ? (
          <p className="mt-2 text-role-micro uppercase tracking-widest text-text-faint">
            Custom range active
          </p>
        ) : null}
      </section>

      {/* No SidebarSectionHeading here — PhotoLabelsSection renders its own
          "Labels" eyebrow (plus a Clear action), so adding one stacked the same
          word twice. */}
      <section>
        <PhotoLabelsSection
          activeLabel={filters.label ?? null}
          scopeImageType={filters.imageType}
          onSelect={onSelectLabel}
        />
      </section>
    </SidebarShell>
  );
}
