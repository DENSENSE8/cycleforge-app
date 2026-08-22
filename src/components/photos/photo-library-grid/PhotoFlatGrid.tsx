'use client';

import { useMemo } from 'react';
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { groupPhotosByCaptureDay } from '@/lib/photos/capture-day-groups';
import type { PhotoLibraryViewMode } from '@/lib/photos/library-filter-state';
import {
  photoGridLeafClass,
  photoGridTileProps,
  type PhotoGridDensity,
} from '@/lib/photos/photo-grid-density';
import { PhotoCard } from './PhotoCard';
import type { PhotoGridViewProps } from './types';

/**
 * The flat reverse-chronological photo stream — the library's primary surface.
 *
 * grid-sm: dense square contact sheet. grid-lg: larger natural-aspect labeled
 * cards. BOTH are CSS grids so items flow left→right, top→bottom — i.e. the
 * active sort reads across rows. (grid-lg used CSS multi-column masonry, which
 * fills top→bottom DOWN each column, so chronological order ran down columns,
 * not across — `items-start` keeps the natural-height cards top-aligned.)
 *
 * **Day bands replaced the folder drill.** Photos band by warehouse civil
 * capture day with a sticky `DateGroupHeader`, so the stream stays scannable
 * without the calendar being a place you descend into. Grouping order comes
 * from the server sort (see `groupPhotosByCaptureDay` — it does not sort).
 *
 * Sticky discipline (one sticky layer per
 * scroll port): the workbench chrome renders OUTSIDE the scroll body via
 * `DashboardScrollShell`'s `chrome` slot, so these bands are the only sticky
 * layer inside the port and dock at `top-0` with no offset math.
 */
export function PhotoFlatGrid({
  gridDensity,
  photos,
  scope,
  selectionActive,
  selected,
  onSelectTile,
  onPhotoContextMenu,
  openAt,
}: PhotoGridViewProps & { view: PhotoLibraryViewMode; gridDensity: PhotoGridDensity }) {
  const showLabel = gridDensity === 'lg';
  const containerClass = photoGridLeafClass(gridDensity);
  const dayGroups = useMemo(() => groupPhotosByCaptureDay(photos), [photos]);

  const renderTile = (photo: (typeof photos)[number]) => {
    const tile = photoGridTileProps(photo, gridDensity);
    return (
      <PhotoCard
        key={photo.id}
        photo={photo}
        imageUrl={tile.imageUrl}
        scope={scope}
        ratio={tile.ratio}
        showLabel={showLabel}
        selectionActive={selectionActive}
        selected={selected.has(photo.id)}
        onSelect={(mods) => onSelectTile(photo.id, mods)}
        onOpen={() => openAt(photo.id)}
        onContextMenu={onPhotoContextMenu}
      />
    );
  };

  return (
    <div className="stack-section">
      {dayGroups.map((group, index) => (
        // A day can legitimately appear more than once (see
        // groupPhotosByCaptureDay) so the dateKey alone is not unique — pair it
        // with the band index. The leading photo id would change identity on
        // every page append and remount the whole band.
        <section key={`${group.dateKey}-${index}`}>
          {group.dateKey ? (
            <DateGroupHeader
              date={group.dateKey}
              total={group.photos.length}
              // Opaque: full-colour photos scroll under this band, and at the
              // default 90% they tint the label and stop the band reading as
              // white. Text rows keep the translucent default.
              surface="solid"
              // Drop the queue-row horizontal pad (px-3): the band label must sit
              // on the tile grid's own edge, and the Panel already supplies the
              // page inset. The sticky fill still spans the full width, so tiles
              // scrolling underneath stay masked.
              className="mb-1.5 px-0"
            />
          ) : null}
          <div className={containerClass}>{group.photos.map(renderTile)}</div>
        </section>
      ))}
    </div>
  );
}
