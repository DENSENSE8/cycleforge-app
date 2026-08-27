'use client';

import { LayoutDashboard, List, Loader2, Pencil, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WORKBENCH_CHROME_CUBE_GLYPH_CLASS } from '@/components/dashboard/workbench-chrome-cube';
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

/**
 * Band 3 control strip for `/ops/photos`: density · refresh · select ·
 * icons/list. Sort / Views / media type / filters live on Bands 1–2.
 *
 * **Every control is a full-height band CELL** — `self-stretch aspect-square`
 * via {@link mediaBandCellClass}, never a pinned `h-8` square and never an
 * `h-7` button inside a `p-0.5` bordered box. Those two shapes are what made
 * this strip 32px and 34px tall inside a 28px row, so the controls overflowed
 * the band and no two of them shared a top or bottom edge. Cells abut inside a
 * group (one collapsed hairline) and groups separate by one gap unit, so the
 * row reads as three clusters of peers.
 *
 * It renders the density cells itself rather than delegating to
 * {@link PhotoGridDisplayControls}: that component serves the embedded ATTACH
 * pickers (claim · move · media picker), which are not on a 28px chrome band
 * and legitimately keep the boxed-group face. Only the icon MAP is shared, so
 * the two surfaces cannot disagree about which glyph means which size.
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

export function PhotoDisplayControls({
  view,
  onViewChange,
  density,
  onDensityChange,
  showDensity,
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
  selectionActive: boolean;
  onStartSelect: () => void;
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
                  <Icon className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />
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
              <Loader2 className={cn(WORKBENCH_CHROME_CUBE_GLYPH_CLASS, 'animate-spin')} />
            ) : (
              <RefreshCw className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />
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
            onClick={onStartSelect}
            className={mediaBandCellClass(selectionActive)}
          >
            <Pencil className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />
          </button>
        </HoverTooltip>
      </div>

      {/*
        Display toggle — Icons (the flat photo stream) vs List. ALWAYS rendered,
        including at any surviving folder drill level: it is the only chrome
        control that escapes folder mode, so hiding it made the old default
        landing state inescapable. Switching either way keeps the active date
        range, so a drill degrades into a filter.

        Icons targets DEFAULT_PHOTO_LIBRARY_VIEW (the flat grid), NOT `folders`
        — pointing it back at the hierarchy would make the escape hatch a loop.
      */}
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
                <Icon className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </>
  );
}
