'use client';

import { useMemo, useState } from 'react';
import type { LibraryPhoto } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import { LightboxPortal } from './LightboxPortal';
import { toGalleryInputs } from './photo-grid-format';
import { photoGroupKey, UNLINKED_PHOTO_GROUP_KEY } from '@/lib/photos/display-names';

/** The folders view owns its own per-folder viewer; the flat views (list, grid, grid-ticket) share one page-level lightbox. */
export function usePhotoGridLightbox({
  photos,
  sourceScope,
  onPhotoDeleted,
}: {
  photos: LibraryPhoto[];
  sourceScope: PhotoLibrarySourceScope;
  onPhotoDeleted?: (photoId: number) => void;
}) {
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const openScope = useMemo(() => {
    if (openPhotoId == null) return null;
    const clicked = photos.find((p) => p.id === openPhotoId);
    if (!clicked) return null;
    const groupKey = photoGroupKey(clicked, sourceScope);
    const group =
      groupKey === UNLINKED_PHOTO_GROUP_KEY
        ? [clicked]
        : photos.filter((p) => photoGroupKey(p, sourceScope) === groupKey);
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      inputs: toGalleryInputs(sorted, sourceScope),
      startIndex: Math.max(0, sorted.findIndex((p) => p.id === openPhotoId)),
    };
  }, [openPhotoId, photos, sourceScope]);
  const openAt = (id: number) => setOpenPhotoId(id);

  // Rendered inside each flat-view branch (folders excluded). Mounts lazily so
  // images preload only once a photo is actually opened.
  const lightbox = openScope ? (
    <LightboxPortal
      photos={openScope.inputs}
      startIndex={openScope.startIndex}
      onClose={() => setOpenPhotoId(null)}
      onPhotoDeleted={onPhotoDeleted}
    />
  ) : null;

  return { openAt, lightbox };
}
