'use client';

import { Check, Folder, Loader2 } from '@/components/Icons';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { FolderTileCover } from '@/components/photos/photo-library-grid/FolderTileCover';
import type { PhotoDateNav } from '@/components/photos/photo-library-grid/types';
import { Button } from '@/design-system/primitives';
import type { LibraryFolderTile } from '@/hooks/usePhotoLibraryFolders';
import { photoContentUrl } from '@/lib/photos/display-url';
import { photoGridLeafClass, photoGridTileProps, type PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

interface MediaLibraryPickerFoldersProps {
  gridDensity: PhotoGridDensity;
  selectedIds: Set<number>;
  onToggle: (photo: LibraryPhoto) => void;
  excludePhotoIds?: Set<number>;
  /** Skip folder drill (e.g. carton receivingId tab). */
  forceLeaf?: boolean;
  isLeaf: boolean;
  eyebrow: string;
  folderTiles: LibraryFolderTile[];
  foldersLoading?: boolean;
  onDateNav: (nav: PhotoDateNav) => void;
  /** Leaf / forceLeaf photo page. */
  photos: LibraryPhoto[];
  photosLoading?: boolean;
  hasMorePhotos?: boolean;
  isFetchingMorePhotos?: boolean;
  onLoadMorePhotos?: () => void;
  leafTitle?: string;
}

/**
 * Year → Month → Week → Day folder drill (same aggregation API as the main
 * library folders view) with a selectable photo grid at the leaf (5 + Load more).
 */
export function MediaLibraryPickerFolders({
  gridDensity,
  selectedIds,
  onToggle,
  excludePhotoIds,
  forceLeaf = false,
  isLeaf,
  eyebrow,
  folderTiles,
  foldersLoading = false,
  onDateNav,
  photos,
  photosLoading = false,
  hasMorePhotos = false,
  isFetchingMorePhotos = false,
  onLoadMorePhotos,
  leafTitle,
}: MediaLibraryPickerFoldersProps) {
  const showLeaf = forceLeaf || isLeaf;

  const leafVisible = excludePhotoIds?.size
    ? photos.filter((p) => !excludePhotoIds.has(p.id))
    : photos;

  if (showLeaf) {
    if (photosLoading && leafVisible.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      );
    }
    if (leafVisible.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
          <p className="text-role-caption font-semibold text-text-muted">No photos here</p>
          <p className="mt-1 text-role-micro text-text-faint">Try another folder or widen the date range.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          {leafTitle ?? 'Photos'}
          <span className="ml-2 font-semibold text-text-faint">{leafVisible.length}</span>
          {hasMorePhotos ? (
            <span className="ml-1 font-normal normal-case tracking-normal text-text-faint">+</span>
          ) : null}
        </p>
        <div className={photoGridLeafClass(gridDensity)}>
          {leafVisible.map((p) => {
            const on = selectedIds.has(p.id);
            const tile = photoGridTileProps(p, gridDensity);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p)}
                aria-pressed={on}
                className={cn(
                  'ds-raw-button relative overflow-hidden rounded-lg border-2 transition',
                  on ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-border-default',
                )}
              >
                <PhotoThumb src={tile.imageUrl} alt={p.caption ?? ''} ratio={tile.ratio} />
                {on ? (
                  <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {hasMorePhotos && onLoadMorePhotos ? (
          <div className="flex justify-center py-2">
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
      </div>
    );
  }

  if (foldersLoading && folderTiles.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (folderTiles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
        <p className="text-role-caption font-semibold text-text-muted">No folders here</p>
        <p className="mt-1 text-role-micro text-text-faint">Widen the date range or pick another media type.</p>
      </div>
    );
  }

  const folderCount = folderTiles.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-3">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        {eyebrow}
        <span className="ml-2 font-semibold text-text-faint">{folderCount}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {folderTiles.map((t) => (
          <PickerFolderTile
            key={t.key}
            tile={t}
            onOpen={() =>
              onDateNav({
                dateFrom: t.dateFrom,
                dateTo: t.dateTo,
                poRef: t.poRef,
                ticketId: t.ticketId,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function PickerFolderTile({ tile, onOpen }: { tile: LibraryFolderTile; onOpen: () => void }) {
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

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="ds-raw-button group flex flex-col overflow-hidden rounded-lg border border-border bg-surface-card text-left transition-colors hover:border-primary/70 hover:bg-surface-hover"
    >
      <div className="relative h-28 w-full p-1.5">
        <div className="absolute left-3 right-2 top-0.5 h-3 rounded-t-md bg-surface-strong" aria-hidden="true" />
        <div className="relative h-full w-full overflow-hidden rounded-md border border-border-soft">
          <FolderTileCover photo={previewAsPhoto} />
          <span className="absolute right-2 top-2 rounded-full bg-scrim/70 px-1.5 py-0.5 text-role-micro font-bold tabular-nums text-white">
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
