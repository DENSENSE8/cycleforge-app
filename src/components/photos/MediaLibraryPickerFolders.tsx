'use client';

import { Check, Folder } from '@/components/Icons';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import { photoGridLeafClass, photoGridTileProps, type PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { formatDateTimePST } from '@/utils/date';
import {
  describeFolderBrowseHeader,
  type FolderTileData,
} from '@/components/photos/photo-library-grid/date-folder-tree';
import { FolderTileCover } from '@/components/photos/photo-library-grid/FolderTileCover';
import { useDateFolders } from '@/components/photos/photo-library-grid/useDateFolders';
import type { PhotoDateNav } from '@/components/photos/photo-library-grid/types';
import { cn } from '@/utils/_cn';

interface MediaLibraryPickerFoldersProps {
  photos: LibraryPhoto[];
  scope: PhotoLibrarySourceScope;
  gridDensity: PhotoGridDensity;
  dateNav: PhotoDateNav;
  onDateNav: (nav: PhotoDateNav) => void;
  selectedIds: Set<number>;
  onToggle: (photo: LibraryPhoto) => void;
  excludePhotoIds?: Set<number>;
  /**
   * Contextual leaf ids from the picker host (ticket / carton tab). Prefer these
   * over `dateNav` so "This ticket" / "Current carton" open the photo grid
   * immediately instead of the year drill.
   */
  resolvedTicketId?: string;
  resolvedPoRef?: string;
  /** Skip the date folder drill and show the photo grid (e.g. carton receivingId tab). */
  forceLeaf?: boolean;
}

/**
 * Year → Month → Week → Day folder drill (same model as the main library folders
 * view) with a selectable photo grid at the leaf.
 */
export function MediaLibraryPickerFolders({
  photos,
  scope,
  gridDensity,
  dateNav,
  onDateNav,
  selectedIds,
  onToggle,
  excludePhotoIds,
  resolvedTicketId,
  resolvedPoRef,
  forceLeaf = false,
}: MediaLibraryPickerFoldersProps) {
  const visible = excludePhotoIds?.size
    ? photos.filter((p) => !excludePhotoIds.has(p.id))
    : photos;

  const ticketId = resolvedTicketId ?? dateNav.ticketId;
  const poRef = resolvedPoRef ?? dateNav.poRef;

  const folders = useDateFolders({
    photos: visible,
    scope,
    dateFrom: dateNav.dateFrom,
    dateTo: dateNav.dateTo,
    poRef,
    ticketId,
    onNavigate: onDateNav,
  });

  const isLeaf = forceLeaf || folders.isLeaf;
  const leafPhotos = forceLeaf ? visible : folders.leafPhotos;
  const tiles = folders.tiles;
  const onOpen = folders.onOpen;

  const header = forceLeaf
    ? { title: 'Photos', count: visible.length }
    : describeFolderBrowseHeader({
        photos: visible,
        scope,
        dateFrom: dateNav.dateFrom,
        dateTo: dateNav.dateTo,
        poRef,
        ticketId,
      });

  const leafVisible = excludePhotoIds?.size
    ? leafPhotos.filter((p) => !excludePhotoIds.has(p.id))
    : leafPhotos;

  if (isLeaf) {
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
          {header.title}
          <span className="ml-2 font-semibold text-text-faint">{leafVisible.length}</span>
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
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
        <p className="text-role-caption font-semibold text-text-muted">No folders here</p>
        <p className="mt-1 text-role-micro text-text-faint">Widen the date range or pick another media type.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        {header.title}
        <span className="ml-2 font-semibold text-text-faint">{header.count}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <PickerFolderTile key={t.key} tile={t} onOpen={() => onOpen(t)} />
        ))}
      </div>
    </div>
  );
}

function PickerFolderTile({ tile, onOpen }: { tile: FolderTileData; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ds-raw-button group flex flex-col overflow-hidden rounded-lg border border-border bg-surface-card text-left transition-colors hover:border-primary/70 hover:bg-surface-hover"
    >
      <div className="relative h-28 w-full p-1.5">
        <div className="absolute left-3 right-2 top-0.5 h-3 rounded-t-md bg-surface-strong" aria-hidden="true" />
        <div className="relative h-full w-full overflow-hidden rounded-md border border-border-soft">
          <FolderTileCover photo={tile.previewPhoto} />
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
