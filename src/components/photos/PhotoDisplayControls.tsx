'use client';

import { LayoutDashboard, List, Loader2, Pencil, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { cn } from '@/utils/_cn';
import { PhotoGridDisplayControls } from './PhotoGridDisplayControls';
import { photoLibraryControlButtonClass, photoLibraryControlGroupClass } from './photo-library-controls';

/**
 * Two-mode display toggle — Icons (the flat photo stream) vs List. Built from the
 * SAME control-group primitives as the grid-density toggle so the two read as one
 * consistent, compact control cluster. "Icons" drives the default flat grid;
 * grid density sizes the tiles separately.
 */
type DisplayItem = {
  id: 'icons' | 'list';
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

const DISPLAY_ITEMS: DisplayItem[] = [
  { id: 'icons', label: 'Icons', icon: LayoutDashboard },
  { id: 'list', label: 'List', icon: List },
];

/**
 * Path-strip control cluster for in-folder photos: density · refresh · select ·
 * icons/list. Sort / media type / filters stay in {@link PhotoLibraryWorkspaceHeader}.
 */
export function PhotoDisplayControls({
  view,
  onViewChange,
  density,
  onDensityChange,
  showDensity,
  showSelect,
  selectionActive,
  onStartSelect,
  onRefresh,
  isRefreshing,
}: {
  view: PhotoLibraryViewMode;
  onViewChange: (view: PhotoLibraryViewMode) => void;
  density: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  showDensity: boolean;
  showSelect: boolean;
  selectionActive: boolean;
  onStartSelect: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  // Left→right on the breadcrumb row: density → refresh → Select → display toggle.
  return (
    <>
      {showDensity ? (
        <PhotoGridDisplayControls
          className="shrink-0"
          density={density}
          onDensityChange={onDensityChange}
        />
      ) : null}

      {/* Refresh stays on the path strip across every view. */}
      <HoverTooltip label="Refresh photos" placement="above" asChild>
        <button
          type="button"
          aria-label="Refresh photos"
          disabled={isRefreshing}
          onClick={onRefresh}
          className="ds-raw-button flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-surface-card text-text-soft transition-colors hover:bg-surface-sunken hover:text-text-default disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </HoverTooltip>

      {/* Select (edit) — highlighted when active. */}
      {showSelect ? (
        <HoverTooltip label={selectionActive ? 'Done selecting' : 'Select'} placement="above" asChild>
          <div className={cn(photoLibraryControlGroupClass, 'shrink-0')}>
            <button
              type="button"
              aria-label={selectionActive ? 'Done selecting' : 'Select'}
              aria-pressed={selectionActive}
              onClick={onStartSelect}
              className={cn('ds-raw-button', photoLibraryControlButtonClass(selectionActive, 'w-7'))}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </HoverTooltip>
      ) : null}

      {/*
        Display toggle — Icons (the flat photo stream) vs List. ALWAYS rendered,
        including at any surviving folder drill level: it is the only chrome
        control that escapes folder mode, so hiding it made the old default
        landing state inescapable. Switching either way keeps the active date
        range, so a drill degrades into a filter.

        Icons targets DEFAULT_PHOTO_LIBRARY_VIEW (the flat grid), NOT `folders`
        — pointing it back at the hierarchy would make the escape hatch a loop.
      */}
      <div className={cn(photoLibraryControlGroupClass, 'shrink-0')} role="group" aria-label="Photo display">
        {DISPLAY_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = (view === 'list' ? 'list' : 'icons') === id;
          return (
            <HoverTooltip key={id} label={label} placement="above" asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onViewChange(id === 'list' ? 'list' : DEFAULT_PHOTO_LIBRARY_VIEW)}
                className={cn('ds-raw-button', photoLibraryControlButtonClass(active, 'w-7'))}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </>
  );
}
