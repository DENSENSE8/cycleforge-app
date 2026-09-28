'use client';

/** Media Library card find row — SearchField + filter + views + display controls + fullscreen. */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { SearchField } from '@/design-system/primitives';
import { DATA_TABLE_TOOLBAR_CORNER, DROPDOWN_ITEM_CORNER, DROPDOWN_SHELL_CORNER, cornerClass } from '@/design-system/tokens/radius';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import type { MediaViewPayload } from '@/hooks/useMediaLibrarySavedViews';
import {
  PHOTO_SEARCH_FIELDS,
  PHOTO_SEARCH_FIELD_LABELS,
  countActivePhotoLibraryFilters,
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryFilterState,
  type PhotoLibraryViewMode,
  type PhotoSearchField,
} from '@/lib/photos/library-filter-state';
import type { PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { MediaViewsMenu } from './MediaViewsMenu';
import { PhotoDisplayControls } from './PhotoDisplayControls';
import { PhotoLibraryFilterDropdown } from './PhotoLibraryFilterDropdown';

export function PhotoLibraryFindRow({
  filters,
  view,
  search,
  searchField,
  onSearchFieldChange,
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
  /** The one find box, as data — the page holds the value in `useState`. */
  search: { value: string; onChange: (value: string) => void };
  /** Field scope the matcher applies (see {@link filterPhotosByQuery}). */
  searchField: PhotoSearchField;
  onSearchFieldChange: (field: PhotoSearchField) => void;
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
  const [kindOpen, setKindOpen] = useState(false);
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

  const pickSearchField = (field: PhotoSearchField) => {
    onSearchFieldChange(field);
    setKindOpen(false);
  };

  return (
    <div
      data-testid="photo-library-find-row"
      className={cn(
        'flex min-w-0 items-center gap-2 border-b border-border-soft bg-surface-card pl-2 pr-0',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >
      <Popover.Root open={kindOpen} onOpenChange={setKindOpen}>
        <Popover.Anchor asChild>
          <div className="relative min-w-0 max-w-[22rem] flex-1">
            <SearchField
              value={search.value}
              onChange={search.onChange}
              onClear={() => search.onChange('')}
              placeholder="Find in loaded photos — order # / tracking / serial…"
              className={cn('min-w-0 flex-1 overflow-hidden', DATA_TABLE_TOOLBAR_CORNER)}
              tone="neutral"
              hideUnderline
              fillHost
              onLeadingAction={() => setKindOpen((o) => !o)}
              leadingActionLabel={`Search by ${PHOTO_SEARCH_FIELD_LABELS[searchField]}`}
              leadingActionExpanded={kindOpen}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className={cn(
              'z-dropdown w-44 border border-border-soft bg-surface-card p-1 shadow-lg',
              DROPDOWN_SHELL_CORNER,
            )}
            data-testid="photo-library-finder-kind"
          >
            {PHOTO_SEARCH_FIELDS.map((field) => {
              const active = field === searchField;
              return (
                <button
                  key={field}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pickSearchField(field)}
                  className={cn(
                    'ds-raw-button flex w-full items-center px-2 py-1.5 text-left text-role-caption',
                    DROPDOWN_ITEM_CORNER,
                    focusRing('control'),
                    active
                      ? 'bg-surface-sunken font-semibold text-text-default'
                      : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
                  )}
                >
                  {PHOTO_SEARCH_FIELD_LABELS[field]}
                </button>
              );
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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
          <DeskRecordViewSwitch labels="wide" />
        </span>
      </span>
    </div>
  );
}
