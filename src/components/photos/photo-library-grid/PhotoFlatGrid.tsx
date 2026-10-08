'use client';

import { useMemo } from 'react';
import type { PhotoLibraryViewMode } from '@/lib/photos/library-filter-state';
import {
  photoGridLeafClass,
  photoGridTileProps,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import { TicketNasBackupButton } from '../TicketNasBackupButton';
import { PhotoCard } from './PhotoCard';
import { PhotoEntityGroupHeader } from './PhotoEntityGroupHeader';
import { groupPhotosByTicket } from './photo-grid-format';
import type { PhotoGridViewProps } from './types';

/** Google Photos–style entity wall — PO / ticket bands with one title each, select-all on the band, and a flush tile grid with **no… */
export function PhotoFlatGrid({
  gridDensity,
  photos,
  scope,
  selectionActive,
  selected,
  onSelectTile,
  onToggleGroupSelection,
  onPhotoContextMenu,
  openAt,
}: PhotoGridViewProps & { view: PhotoLibraryViewMode; gridDensity: PhotoGridDensity }) {
  const containerClass = photoGridLeafClass(gridDensity);
  const groups = useMemo(() => groupPhotosByTicket(photos, scope), [photos, scope]);
  const showNasBackup = scope === 'claims';

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const groupIds = group.photos.map((p) => p.id);
        const allGroupSelected =
          groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const someGroupSelected = groupIds.some((id) => selected.has(id));
        const { ticketNumber } = group;

        return (
          <section key={group.key} data-testid="photo-entity-group">
            <PhotoEntityGroupHeader
              title={group.label}
              kind={group.kind}
              dateLabel={group.dateLabel}
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
