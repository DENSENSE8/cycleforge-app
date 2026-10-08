'use client';

import { type MouseEvent as ReactMouseEvent } from 'react';
import type { LibraryPhoto } from './photo-library-types';
import { Image as ImageIcon } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { PhotoLibrarySourceScope, PhotoLibraryViewMode } from '@/lib/photos/library-filter-state';
import type { PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { PhotoEmptyState, PhotoGridSkeleton } from './photo-library-grid/PhotoGridStates';
import { usePhotoGridLightbox } from './photo-library-grid/usePhotoGridLightbox';
import { usePhotoGridKeyboardNav } from './photo-library-grid/usePhotoGridKeyboardNav';
import {
  PhotoDateWindowReveal,
  usePhotoDateWindowRevealKey,
} from './photo-library-grid/PhotoDateWindowReveal';
import { PhotoListView } from './photo-library-grid/PhotoListView';
import { PhotoTicketGrid } from './photo-library-grid/PhotoTicketGrid';
import { PhotoFlatGrid } from './photo-library-grid/PhotoFlatGrid';
import type { TileSelectMods } from './photo-library-grid/types';

export type { PhotoDateNav, TileSelectMods } from './photo-library-grid/types';

interface PhotoLibraryGridProps {
  photos: LibraryPhoto[];
  view: PhotoLibraryViewMode;
  gridDensity: PhotoGridDensity;
  /** Source scope drives tile labels (PO# for unboxing, Order# for packing). */
  sourceScope?: PhotoLibrarySourceScope;
  /** Whether selection UI (checkmarks, toggle-on-click) is engaged. */
  selectionActive: boolean;
  /** The currently-selected photo ids. */
  selected: Set<number>;
  /** Select/toggle a tile (the page owns range/anchor logic). */
  onSelectTile: (id: number, mods: TileSelectMods) => void;
  onToggleGroupSelection?: (ids: number[]) => void;
  /** Right-click a photo tile — the page opens the contextual action menu. */
  onPhotoContextMenu?: (photo: LibraryPhoto, e: ReactMouseEvent) => void;
  /** Called after a photo is deleted from the viewer so the list refreshes. */
  onPhotoDeleted?: (photoId: number) => void;
  /**
   * The session-local find value, for the no-matches empty state only. The page
   * has already narrowed `photos` with it (`filterPhotosByQuery`) — the grid
   * never filters, so display and count can never disagree.
   */
  searchQuery?: string;
  isLoading: boolean;
  error: string | null;
}

export function PhotoLibraryGrid({
  photos,
  view,
  gridDensity,
  sourceScope = 'all',
  selectionActive,
  selected,
  onSelectTile,
  onToggleGroupSelection,
  onPhotoContextMenu,
  onPhotoDeleted,
  isLoading,
  error,
  searchQuery = '',
}: PhotoLibraryGridProps) {
  const { openAt, lightbox } = usePhotoGridLightbox({ photos, sourceScope, onPhotoDeleted });
  // Roving arrow-key navigation across tiles (←/→/↑/↓/Home/End + Space to select).
  // Attached to the wall wrapper below so it only fires while focus is inside the grid.
  const onGridKeyDown = usePhotoGridKeyboardNav({ onSelect: onSelectTile });
  // Called before the early returns so a window that passes through an empty
  // state still animates in when its photos land.
  const revealKey = usePhotoDateWindowRevealKey(photos);

  // Only skeleton when we have nothing to show — keepPreviousData keeps prior tiles up.
  if (isLoading && photos.length === 0) {
    return <PhotoGridSkeleton />;
  }
  if (error) {
    return (
      <div
        className={cn(
          'mx-auto mt-6 flex max-w-sm flex-col items-center gap-2 border border-dashed border-rose-200 bg-rose-50 inset-empty text-center',
          cornerClass('flush'),
        )}
      >
        <ImageIcon className="h-6 w-6 text-rose-400" />
        <p className="text-sm font-semibold text-rose-900">Couldn’t load photos</p>
        <p className="text-xs leading-relaxed text-rose-600">{error}</p>
      </div>
    );
  }
  if (photos.length === 0) {
    return <PhotoEmptyState searchQuery={searchQuery} />;
  }

  const wall =
    view === 'list' ? (
      <PhotoListView
        photos={photos}
        scope={sourceScope}
        selectionActive={selectionActive}
        selected={selected}
        onSelectTile={onSelectTile}
        onToggleGroupSelection={onToggleGroupSelection}
        onPhotoContextMenu={onPhotoContextMenu}
        openAt={openAt}
      />
    ) : view === 'grid-ticket' ? (
      <PhotoTicketGrid
        photos={photos}
        scope={sourceScope}
        gridDensity={gridDensity}
        selectionActive={selectionActive}
        selected={selected}
        onSelectTile={onSelectTile}
        onToggleGroupSelection={onToggleGroupSelection}
        onPhotoContextMenu={onPhotoContextMenu}
        openAt={openAt}
      />
    ) : (
      <PhotoFlatGrid
        view={view}
        gridDensity={gridDensity}
        photos={photos}
        scope={sourceScope}
        selectionActive={selectionActive}
        selected={selected}
        onSelectTile={onSelectTile}
        onToggleGroupSelection={onToggleGroupSelection}
        onPhotoContextMenu={onPhotoContextMenu}
        openAt={openAt}
      />
    );

  return (
    <div onKeyDown={onGridKeyDown} className="outline-none">
      <PhotoDateWindowReveal revealKey={revealKey}>{wall}</PhotoDateWindowReveal>
      {lightbox}
    </div>
  );
}
