'use client';

import { type MouseEvent as ReactMouseEvent, useMemo } from 'react';
import type { LibraryPhoto } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import { photoGridLeafClass, photoGridTileProps, type PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { formatDateTimePST } from '@/utils/date';
import { Folder, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PhotoCard } from './PhotoCard';
import { PhotoEmptyState, PhotoGridSkeleton } from './PhotoGridStates';
import { LightboxPortal } from './LightboxPortal';
import { useDateFolders } from './useDateFolders';
import type { FolderTileData } from './date-folder-tree';
import { FolderTileCover } from './FolderTileCover';
import { toGalleryInputs } from './photo-grid-format';
import type { PhotoDateNav, TileSelectMods } from './types';
import type { LibraryFolderTile } from '@/hooks/usePhotoLibraryFolders';
import { photoContentUrl } from '@/lib/photos/display-url';

/**
 * Folders: server-aggregated tiles at year→…→entity levels; leaf contact sheet
 * is a small photo page (5) with explicit Load more — never infinite-scroll the
 * whole library to paint folder counts.
 */
export function FoldersView({
  photos,
  scope,
  gridDensity,
  dateFrom,
  dateTo,
  poRef,
  ticketId,
  onNavigate,
  selectionActive,
  selected,
  onSelectTile,
  onPhotoContextMenu,
  onPhotoDeleted,
  isSettled = true,
  /** Server folder tiles when not at a photo leaf. */
  folderTiles,
  foldersLoading = false,
  isLeaf = false,
  hasMorePhotos = false,
  isFetchingMorePhotos = false,
  onLoadMorePhotos,
}: {
  photos: LibraryPhoto[];
  scope: PhotoLibrarySourceScope;
  gridDensity: PhotoGridDensity;
  dateFrom?: string;
  dateTo?: string;
  poRef?: string;
  ticketId?: string;
  onNavigate: (nav: PhotoDateNav) => void;
  selectionActive: boolean;
  selected: Set<number>;
  onSelectTile: (id: number, mods: TileSelectMods) => void;
  onPhotoContextMenu?: (photo: LibraryPhoto, e: ReactMouseEvent) => void;
  onPhotoDeleted?: (photoId: number) => void;
  isSettled?: boolean;
  folderTiles?: LibraryFolderTile[];
  foldersLoading?: boolean;
  isLeaf?: boolean;
  hasMorePhotos?: boolean;
  isFetchingMorePhotos?: boolean;
  onLoadMorePhotos?: () => void;
}) {
  // Leaf uses useDateFolders for lightbox / leaf photos from the page stream.
  // Non-leaf must NOT call it — empty photo stream would false-trigger day→week widen.
  const leafFolders = useDateFolders({
    photos: isLeaf ? photos : [],
    scope,
    dateFrom,
    dateTo,
    poRef,
    ticketId,
    onNavigate,
    isSettled: isLeaf ? isSettled : false,
  });
  const leafPhotos = isLeaf ? photos : leafFolders.leafPhotos;
  const { openIndex, setOpenIndex } = leafFolders;
  // Rebuild gallery inputs from the page stream when we override leafPhotos.
  const leafInputs = useMemo(
    () => (isLeaf ? toGalleryInputs(photos, scope) : leafFolders.leafInputs),
    [isLeaf, photos, scope, leafFolders.leafInputs],
  );

  if (!isLeaf) {
    if (foldersLoading && (!folderTiles || folderTiles.length === 0)) {
      return <PhotoGridSkeleton />;
    }
    if (!folderTiles || folderTiles.length === 0) {
      return <PhotoEmptyState />;
    }
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {folderTiles.map((t) => (
          <ServerFolderTile
            key={t.key}
            tile={t}
            onOpen={() =>
              onNavigate({
                dateFrom: t.dateFrom,
                dateTo: t.dateTo,
                poRef: t.poRef,
                ticketId: t.ticketId,
              })
            }
          />
        ))}
      </div>
    );
  }

  if (!isSettled && photos.length === 0) {
    return <PhotoGridSkeleton />;
  }

  if (leafPhotos.length === 0) return <PhotoEmptyState />;

  return (
    <div className="space-y-3">
      <div className={photoGridLeafClass(gridDensity)}>
        {leafPhotos.map((photo, i) => {
          const tile = photoGridTileProps(photo, gridDensity);
          return (
            <PhotoCard
              key={photo.id}
              photo={photo}
              imageUrl={tile.imageUrl}
              scope={scope}
              ratio={tile.ratio}
              showLabel={false}
              selectionActive={selectionActive}
              selected={selected.has(photo.id)}
              onSelect={(mods) => onSelectTile(photo.id, mods)}
              onOpen={() => setOpenIndex(i)}
              onContextMenu={onPhotoContextMenu}
            />
          );
        })}
      </div>
      {hasMorePhotos && onLoadMorePhotos ? (
        <div className="flex justify-center py-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isFetchingMorePhotos}
            onClick={onLoadMorePhotos}
            icon={isFetchingMorePhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
          >
            {isFetchingMorePhotos ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
      {openIndex !== null ? (
        <LightboxPortal
          photos={leafInputs}
          startIndex={openIndex}
          onPhotoDeleted={onPhotoDeleted}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  );
}

function ServerFolderTile({
  tile,
  onOpen,
}: {
  tile: LibraryFolderTile;
  onOpen: () => void;
}) {
  const ariaLabel = `${tile.label} · ${tile.count} photo${tile.count === 1 ? '' : 's'}`;
  const previewAsPhoto: LibraryPhoto | undefined =
    tile.previewPhotoId != null
      ? {
          id: tile.previewPhotoId,
          photoType: null,
          poRef: tile.poRef ?? null,
          createdAt: tile.latestAt,
          thumbUrl: tile.previewThumbUrl ?? photoContentUrl(tile.previewPhotoId, 'thumb'),
          displayUrl: photoContentUrl(tile.previewPhotoId),
        }
      : undefined;

  const legacy: FolderTileData = {
    key: tile.key,
    label: tile.label,
    count: tile.count,
    latestAt: tile.latestAt,
    previewPhoto: previewAsPhoto,
  };

  return (
    <button
      type="button"
      data-testid="photo-folder"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="ds-raw-button group flex flex-col overflow-hidden rounded-lg border border-border bg-surface-card text-left transition-colors hover:border-primary/70 hover:bg-surface-hover"
    >
      <div className="relative h-32 w-full p-1.5">
        <div className="absolute left-3 right-2 top-0.5 h-3 rounded-t-md bg-surface-strong" aria-hidden="true" />
        <div className="relative h-full w-full overflow-hidden rounded-md border border-border-soft">
          <FolderTileCover photo={legacy.previewPhoto} />
          <span className="absolute right-2 top-2 rounded-full bg-scrim/70 px-1.5 py-0.5 text-role-micro tabular-nums text-white">
            {tile.count}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="truncate text-role-caption font-semibold text-text-default">{tile.label}</span>
        </div>
        {tile.latestAt ? (
          <span className="truncate pl-5 text-role-micro tabular-nums text-text-faint">
            {formatDateTimePST(tile.latestAt)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
