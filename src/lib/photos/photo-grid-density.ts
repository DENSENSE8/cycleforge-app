/**
 * Photo grid tile density — shared across the media library workbench, folder
 * leaf views, and embedded pickers (Zendesk claim, support attach).
 */

import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import type { PhotoLibraryViewMode } from '@/lib/photos/library-filter-state';

export type PhotoGridDensity = 'sm' | 'md' | 'lg';

export const PHOTO_GRID_DENSITY_ORDER: readonly PhotoGridDensity[] = ['sm', 'md', 'lg'];

export const PHOTO_GRID_DENSITY_LABELS: Record<PhotoGridDensity, string> = {
  sm: 'Small grid',
  md: 'Medium grid',
  lg: 'Large grid',
};

export const PHOTO_GRID_DENSITY_STORAGE_KEY = 'photo-grid-density';

export const DEFAULT_PHOTO_GRID_DENSITY: PhotoGridDensity = 'lg';

/** Tile aspect — `natural` sizes to the image; `square` is a 1:1 crop. */
export type PhotoGridTileRatio = 'square' | 'natural';

export function isPhotoGridDensity(value: string): value is PhotoGridDensity {
  return value === 'sm' || value === 'md' || value === 'lg';
}

/** Large density shows the full image at natural height; sm/md stay square contact sheets. */
export function photoGridTileRatio(density: PhotoGridDensity): PhotoGridTileRatio {
  return density === 'lg' ? 'natural' : 'square';
}

/** Library tiles always use the stable, immutable thumbnail route. */
export function photoGridImageUrl(
  photo: Pick<LibraryPhoto, 'thumbUrl' | 'displayUrl'>,
  _density: PhotoGridDensity,
): string {
  return photo.thumbUrl;
}

export function photoGridTileProps(
  photo: Pick<LibraryPhoto, 'thumbUrl' | 'displayUrl'>,
  density: PhotoGridDensity,
): { ratio: PhotoGridTileRatio; imageUrl: string } {
  return {
    ratio: photoGridTileRatio(density),
    imageUrl: photoGridImageUrl(photo, density),
  };
}

/**
 * Grid density + refresh — grid tile views only (not list).
 *
 * The `folderIsLeaf` argument this used to take is gone with the folder drill:
 * every surviving view paints photo tiles, so there is no longer a level at
 * which the tile controls must hide.
 *
 * Its sibling `photoLibraryShowsSelectControl` was **deleted** rather than left
 * returning a constant `true`. Multi-select was only ever gated because the
 * drill's year/month/week/day levels painted folder tiles with nothing to
 * select; with those gone the gate has no remaining case to express, and a
 * predicate that cannot be false is just a prop to thread and a lie to read.
 */
export function photoLibraryShowsGridControls(view: PhotoLibraryViewMode): boolean {
  return view !== 'list';
}

/** Picker / embedded browse — photos visible at folder leaf or in search results. */
export function mediaPickerShowsGridControls(args: {
  onMediaTypeList: boolean;
  searchActive: boolean;
  folderIsLeaf: boolean;
}): boolean {
  if (args.onMediaTypeList) return false;
  return args.searchActive || args.folderIsLeaf;
}

/** Photo thumbnail grids (folders leaf, grid-sm, grid-ticket, pickers). */
export function photoGridLeafClass(density: PhotoGridDensity): string {
  // gap-0.5 — Google Photos wall seam (~2px); card borders no longer carry the gap.
  switch (density) {
    case 'sm':
      return 'grid grid-cols-4 gap-0.5 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8';
    case 'md':
      return 'grid grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5';
    case 'lg':
      // Natural-height cards — top-align so mixed orientations don't stretch.
      return 'grid grid-cols-2 items-start gap-0.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  }
}

/** @deprecated Use {@link photoGridLeafClass} — labeled grid-lg defers to the same layout. */
export function photoGridLabeledClass(density: PhotoGridDensity): string {
  return photoGridLeafClass(density);
}
