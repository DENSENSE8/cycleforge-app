'use client';

import { LayoutDashboard, List, Loader2, Pencil, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PHOTO_GRID_DENSITY_LABELS,
  PHOTO_GRID_DENSITY_ORDER,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { cn } from '@/utils/_cn';
import { PHOTO_GRID_DENSITY_ICONS } from './PhotoGridDisplayControls';
import { mediaBandCellClass, mediaBandCellGroupClass } from './photo-library-controls';

/** Band 3 control strip for `/ops/photos`: */
type DisplayItem = {
  id: 'icons' | 'list';
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

const DISPLAY_ITEMS: DisplayItem[] = [
  { id: 'icons', label: 'Icons', icon: LayoutDashboard },
  { id: 'list', label: 'List', icon: List },
];

export function PhotoDisplayControls({
  view,
  onViewChange,
  density,
  onDensityChange,
  showDensity,
  selectionActive,
  onToggleSelect,
  onRefresh,
  isRefreshing,
}: {
  view: PhotoLibraryViewMode;
  onViewChange: (view: PhotoLibraryViewMode) => void;
  density: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  showDensity: boolean;
  selectionActive: boolean;
  /** Arms or exits select mode — must toggle both ways (was start-only). */
  onToggleSelect: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  // Left→right on the path strip: density → refresh · select → display toggle.
  return (
    <>
      {showDensity ? (
        <div className={mediaBandCellGroupClass} role="group" aria-label="Grid size">
          {PHOTO_GRID_DENSITY_ORDER.map((id) => {
            const active = density === id;
            const Icon = PHOTO_GRID_DENSITY_ICONS[id];
            const label = PHOTO_GRID_DENSITY_LABELS[id];
            return (
              <HoverTooltip key={id} label={label} placement="above" asChild>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => onDensityChange(id)}
                  className={mediaBandCellClass(active)}
                >
                  <Icon className={'block h-3.5 w-3.5 shrink-0'} />
                </button>
              </HoverTooltip>
            );
          })}
        </div>
      ) : null}

      {/*
        Refresh + Select — two utilities, one abutting pair. Both stay on the
        path strip across every view: every view paints photo tiles, so there is
        no level with nothing to select.
      */}
      <div className={mediaBandCellGroupClass}>
        <HoverTooltip label="Refresh photos" placement="above" asChild>
          <button
            type="button"
            aria-label="Refresh photos"
            disabled={isRefreshing}
            onClick={onRefresh}
            className={mediaBandCellClass(false, 'disabled:cursor-not-allowed disabled:opacity-60')}
          >
            {isRefreshing ? (
              <Loader2 className={cn('block h-3.5 w-3.5 shrink-0', 'animate-spin')} />
            ) : (
              <RefreshCw className={'block h-3.5 w-3.5 shrink-0'} />
            )}
          </button>
        </HoverTooltip>

        <HoverTooltip
          label={selectionActive ? 'Done selecting' : 'Select'}
          placement="above"
          asChild
        >
          <button
            type="button"
            aria-label={selectionActive ? 'Done selecting' : 'Select'}
            aria-pressed={selectionActive}
            onClick={onToggleSelect}
            className={mediaBandCellClass(selectionActive)}
          >
            <Pencil className={'block h-3.5 w-3.5 shrink-0'} />
          </button>
        </HoverTooltip>
      </div>

      {/* Display toggle — Icons (the flat photo stream) vs List. */}
      <div className={mediaBandCellGroupClass} role="group" aria-label="Photo display">
        {DISPLAY_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = (view === 'list' ? 'list' : 'icons') === id;
          return (
            <HoverTooltip key={id} label={label} placement="above" asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onViewChange(id === 'list' ? 'list' : DEFAULT_PHOTO_LIBRARY_VIEW)}
                className={mediaBandCellClass(active)}
              >
                <Icon className={'block h-3.5 w-3.5 shrink-0'} />
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </>
  );
}
