'use client';

import { photoGridLeafClass, photoGridTileProps, type PhotoGridDensity } from '@/lib/photos/photo-grid-density';
import { TicketNasBackupButton } from '../TicketNasBackupButton';
import { PhotoCard } from './PhotoCard';
import { PhotoEntityGroupHeader } from './PhotoEntityGroupHeader';
import { groupPhotosByTicket } from './photo-grid-format';
import type { PhotoGridViewProps } from './types';

/**
 * Group-by-ticket view — same Google Photos entity bands as {@link PhotoFlatGrid}
 * (one PO/ticket title + select-all; tiles stay label-free).
 */
export function PhotoTicketGrid({
  photos,
  scope,
  gridDensity,
  selectionActive,
  selected,
  onSelectTile,
  onToggleGroupSelection,
  onPhotoContextMenu,
  openAt,
}: PhotoGridViewProps & { gridDensity: PhotoGridDensity }) {
  const groups = groupPhotosByTicket(photos, scope);
  const showNasBackup = scope === 'claims';
  const containerClass = photoGridLeafClass(gridDensity);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const groupIds = group.photos.map((p) => p.id);
        const allGroupSelected =
          groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const someGroupSelected = groupIds.some((id) => selected.has(id));
        const ticketNumber = group.key.startsWith('ticket:')
          ? group.key.slice('ticket:'.length)
          : null;

        return (
          <section key={group.key} data-testid="photo-entity-group">
            <PhotoEntityGroupHeader
              title={group.label}
              count={group.photos.length}
              allSelected={allGroupSelected}
              someSelected={someGroupSelected && !allGroupSelected}
              onToggleSelectAll={
                onToggleGroupSelection
                  ? () => onToggleGroupSelection(groupIds)
                  : undefined
              }
              trailing={
                showNasBackup && ticketNumber ? (
                  <TicketNasBackupButton
                    ticketNumber={ticketNumber}
                    size="sm"
                    label="Sync to NAS"
                    className="ml-auto"
                  />
                ) : null
              }
            />
            <div className={containerClass}>
              {group.photos.map((photo) => {
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
                    onOpen={() => openAt(photo.id)}
                    onContextMenu={onPhotoContextMenu}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
