'use client';

import { ColumnsOne, ColumnsThree, ColumnsTwo, Loader2, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PHOTO_GRID_DENSITY_LABELS,
  PHOTO_GRID_DENSITY_ORDER,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { photoLibraryControlButtonClass, photoLibraryControlGroupClass } from './photo-library-controls';

/**
 * Which glyph means which tile size. Exported because the Media Library's Band-3
 * strip paints its own full-height band cells (a 28px chrome row cannot host
 * this component's boxed group) and the two must never disagree about the map.
 */
export const PHOTO_GRID_DENSITY_ICONS: Record<PhotoGridDensity, typeof ColumnsOne> = {
  sm: ColumnsThree,
  md: ColumnsTwo,
  lg: ColumnsOne,
};

export interface PhotoGridDisplayControlsProps {
  density: PhotoGridDensity;
  onDensityChange: (density: PhotoGridDensity) => void;
  /** When set, renders a refresh control to the right of the density toggle. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  disabled?: boolean;
  className?: string;
  /** Override density-group chrome (e.g. claim `p-0`). Radius is already flush. */
  groupClassName?: string;
  /** Override density button chrome. Radius is already flush. */
  buttonClassName?: string;
  /** Override refresh button chrome. Radius is already flush. */
  refreshClassName?: string;
}

/**
 * Top-right grid density + optional refresh — shared by the media library header,
 * folder leaf views, ReceivingClaim attach, and Move photos.
 */
export function PhotoGridDisplayControls({
  density,
  onDensityChange,
  onRefresh,
  isRefreshing = false,
  disabled = false,
  className,
  groupClassName,
  buttonClassName,
  refreshClassName,
}: PhotoGridDisplayControlsProps) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <div
        className={cn(photoLibraryControlGroupClass, disabled && 'opacity-50', groupClassName)}
        role="group"
        aria-label="Grid size"
      >
        {PHOTO_GRID_DENSITY_ORDER.map((id) => {
          const active = density === id;
          const Icon = PHOTO_GRID_DENSITY_ICONS[id];
          const label = PHOTO_GRID_DENSITY_LABELS[id];
          return (
            <HoverTooltip key={id} label={label} asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onDensityChange(id)}
                className={cn(
                  'ds-raw-button',
                  photoLibraryControlButtonClass(active, cn('w-7', buttonClassName)),
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </HoverTooltip>
          );
        })}
      </div>

      {onRefresh ? (
        <HoverTooltip label="Refresh photos" asChild>
          <button
            type="button"
            aria-label="Refresh photos"
            disabled={disabled || isRefreshing}
            onClick={onRefresh}
            className={cn(
              'ds-raw-button flex h-8 w-8 items-center justify-center border border-border-soft bg-surface-card text-text-soft transition-colors',
              cornerClass('flush'),
              'hover:bg-surface-sunken hover:text-text-default disabled:cursor-not-allowed disabled:opacity-60',
              refreshClassName,
            )}
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
