'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import { MovePhotosBetweenPoPanel } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import {
  fetchReceivingPhotoList,
  RECEIVING_PHOTOS_STALE_MS,
  receivingPhotoListQueryKey,
  refreshReceivingPhotos,
} from '@/lib/queries/receiving-queries';
import {
  RECEIVING_PHOTO_LIST_INTENT_CARTON,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  effectiveReceivingPhotoStage,
  receivingPhotoListIntentForScope,
  resolveReceivingPhotoTarget,
} from '@/lib/receiving/photo-scope';

interface PhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

interface PhotosPayload {
  photos: PhotoRow[];
}

/** Compact, action-complete photo task shared by all three receiving stations. */
export function StationPhotosTask({
  receivingId,
  receivingLineId = null,
  staffId,
  poRef = null,
  photoStage,
  onSendToTicket,
}: {
  receivingId: number | null;
  receivingLineId?: number | null;
  staffId: string | number;
  poRef?: string | null;
  photoStage: ReceivingPhotoStage;
  onSendToTicket?: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [moveOpen, setMoveOpen] = useState(false);
  const lineId =
    receivingLineId != null && Number.isFinite(receivingLineId) && receivingLineId > 0
      ? receivingLineId
      : null;
  const validReceivingId = receivingId != null && Number.isFinite(receivingId) && receivingId > 0;
  const stage = effectiveReceivingPhotoStage({ stage: photoStage, receivingLineId: lineId });
  const baseListIntent = receivingPhotoListIntentForScope({ stage, receivingLineId: lineId });
  const listIntent =
    baseListIntent === 'unbox_carton' ? RECEIVING_PHOTO_LIST_INTENT_CARTON : baseListIntent;
  const photoParams = {
    receivingId: receivingId ?? 0,
    photoIntent: listIntent,
    receivingLineId: lineId,
    photoAspect: null,
  };
  const uploadTarget = useMemo(() => {
    if (!validReceivingId || receivingId == null) return null;
    try {
      return {
        ...resolveReceivingPhotoTarget({
          receivingId,
          receivingLineId: lineId,
          stage,
        }),
        poRef: poRef ?? undefined,
      };
    } catch {
      return null;
    }
  }, [lineId, poRef, receivingId, stage, validReceivingId]);
  const photosQuery = useQuery<PhotosPayload>({
    queryKey: receivingPhotoListQueryKey(photoParams),
    queryFn: () => fetchReceivingPhotoList(photoParams),
    enabled: validReceivingId && uploadTarget !== null,
    staleTime: RECEIVING_PHOTOS_STALE_MS,
  });
  const refresh = useCallback(
    (deletedPhotoId?: number) => {
      if (receivingId != null) refreshReceivingPhotos(queryClient, receivingId, deletedPhotoId);
    },
    [queryClient, receivingId],
  );
  const numericStaffId = Number(staffId);
  useReceivingPhotosRealtimeRefresh(
    receivingId ?? 0,
    numericStaffId,
    refresh,
    validReceivingId && numericStaffId > 0 && Boolean(user?.organizationId),
  );
  const photos = useMemo(
    () =>
      (photosQuery.data?.photos ?? [])
        .filter((photo) => Boolean(photo.photoUrl?.trim()))
        .map((photo) => receivingPhotoToGalleryInput(photo, { poRef })),
    [photosQuery.data, poRef],
  );
  const libraryHref = validReceivingId && receivingId != null
    ? buildUnboxingCartonLibraryHref({ receivingId, poRef })
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto py-4" data-testid="station-photos-task">
      <PhotoGallery
        photos={photos}
        launcherLayout="compact"
        launcherTone="neutral"
        receivingId={receivingId ?? undefined}
        libraryHref={libraryHref}
        allowReassign={validReceivingId}
        uploadTarget={uploadTarget ?? undefined}
        onPhotoDeleted={refresh}
        onPhotoUploaded={() => refresh()}
        onPhotoReassigned={() => refresh()}
        onOpenMovePhotosExternal={() => setMoveOpen(true)}
        onSendToTicket={onSendToTicket}
      />
      {moveOpen && receivingId != null ? (
        <div className="w-full max-w-2xl border-t border-border-soft" data-testid="station-photo-move">
          <MovePhotosBetweenPoPanel
            open
            receivingId={receivingId}
            onClose={() => setMoveOpen(false)}
            onMoved={refresh}
            chrome="inline"
          />
        </div>
      ) : null}
    </div>
  );
}
