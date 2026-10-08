'use client';

import { LayoutDashboard, List, Loader2, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  SegmentedGlyphSwitch,
  type SegmentedGlyphOption,
} from '@/design-system/components/SegmentedGlyphSwitch';
import { IconButton } from '@/design-system/primitives/IconButton';
import {
  PHOTO_GRID_DENSITY_LABELS,
  PHOTO_GRID_DENSITY_ORDER,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import {
  DEFAULT_PHOTO_LIBRARY_VIEW,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';
import { PHOTO_GRID_DENSITY_ICONS } from './PhotoGridDisplayControls';

/** Icons (the flat photo stream) vs List — the house pick-one display switch (operator 2026-10-08: bigger, rounded, pressable). */
const DISPLAY_OPTIONS: readonly SegmentedGlyphOption<'icons' | 'list'>[] = [
  { value: 'icons', label: 'Icons', Glyph: LayoutDashboard, testId: 'photo-display-icons' },
  { value: 'list', label: 'List', Glyph: List, testId: 'photo-display-list' },
];

/** Small · Medium · Large grid — the same switch face as Icons | List. */
const DENSITY_OPTIONS: readonly SegmentedGlyphOption<PhotoGridDensity>[] = PHOTO_GRID_DENSITY_ORDER.map((id) => ({
  value: id,
  label: PHOTO_GRID_DENSITY_LABELS[id],
  Glyph: PHOTO_GRID_DENSITY_ICONS[id],
  testId: `photo-grid-density-${id}`,
}));

/**
 * Band 3 control strip for `/ops/photos`: grid size → refresh → display. One
 * face for all three (operator 2026-10-08): the sunken, rounded well of
 * {@link SegmentedGlyphSwitch}, with a card face under the chosen option.
 */
export function PhotoDisplayControls({
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
    <>
      {showDensity ? (
        <SegmentedGlyphSwitch
          options={DENSITY_OPTIONS}
          value={density}
          onChange={onDensityChange}
          ariaLabel="Grid size"
          testId="photo-grid-density-switch"
        />
      ) : null}

      {/* The switch's well around a single action, so Refresh reads as the same control family. */}
      <span className="inline-flex shrink-0 items-center rounded-mode-control bg-surface-sunken p-0.5">
        <HoverTooltip label="Refresh photos" placement="above" asChild>
          <IconButton
            icon={
              isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
            ariaLabel="Refresh photos"
            size="sm"
            disabled={isRefreshing}
            onClick={onRefresh}
            className="rounded-mode-control text-text-muted hover:bg-surface-card hover:text-text-default hover:shadow-elev-soft"
            data-testid="photo-library-refresh"
          />
        </HoverTooltip>
      </span>

      <SegmentedGlyphSwitch
        options={DISPLAY_OPTIONS}
        value={view === 'list' ? 'list' : 'icons'}
        onChange={(next) => onViewChange(next === 'list' ? 'list' : DEFAULT_PHOTO_LIBRARY_VIEW)}
        ariaLabel="Photo display"
        testId="photo-display-switch"
      />
    </>
  );
}
