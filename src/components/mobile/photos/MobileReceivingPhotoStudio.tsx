'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  MobilePackerSpamCamera,
  type CapturedShot,
} from '@/components/mobile/station/MobilePackerSpamCamera';
import {
  photoUploadQueue,
  useClearDoneOnUnmount,
  type PhotoScope,
} from '@/components/mobile/receiving/PhotoUploadQueue';
import { useNasConfig } from '@/hooks/useNasConfig';
import { useScopedReceivingPhotos } from '@/hooks/useScopedReceivingPhotos';
import { photoAspectLabel, type PhotoAspect } from '@/lib/photos/photo-aspects';
import { photoStageLabel } from '@/lib/photos/stages';
import {
  effectiveReceivingPhotoStage,
  type ArrivalGuidedStep,
} from '@/lib/receiving/photo-scope';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPhoneBridgeChannelName } from '@/lib/realtime/channels';
import { notifyReceivingPhotoChanged } from '@/lib/queries/receiving-queries';
import { MobileReceivingSwipeGallery } from '@/components/mobile/photos/MobileReceivingSwipeGallery';

type MobilePhotoStudioMode = 'capture' | 'gallery';

const ARRIVAL_GUIDED_STEPS: readonly ArrivalGuidedStep[] = [
  'shipping_label',
  'box_exterior',
] as const;

interface MobileReceivingPhotoStudioProps {
  mode: MobilePhotoStudioMode;
  scope: PhotoScope;
  headerLabel: string;
  /** @deprecated Gallery is swipe-only; kept for route compat. */
  galleryTitle?: string;
  /** @deprecated Gallery is swipe-only; kept for route compat. */
  gallerySubtitle?: string;
  backHref: string;
  returnHref: string;
  maxPhotos?: number;
  requestId?: string | null;
  /**
   * Arrival-only guided capture: shipping label → box exterior, each shot
   * stamped with `scope.stage` (must be `arrival_package`) + the step aspect.
   * Omit / false keeps the legacy spam-capture path (aspect unset).
   */
  guided?: boolean;
  /** Guided entry step (from `?step=`); defaults to shipping_label. */
  initialStep?: ArrivalGuidedStep;
}

/**
 * Unified receiving photo station: capture (camera) or gallery (swipe viewer).
 * Optional arrival guided mode mirrors the packer slip→box step machine.
 */
export function MobileReceivingPhotoStudio({
  mode,
  scope,
  headerLabel,
  backHref,
  returnHref,
  maxPhotos = 12,
  requestId = null,
  guided = false,
  initialStep = 'shipping_label',
}: MobileReceivingPhotoStudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  useClearDoneOnUnmount();
  useNasConfig();

  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const notifyStaffId = user?.staffId ?? 0;
  const phoneChannelName = safeChannelName(() => getPhoneBridgeChannelName(orgId!, notifyStaffId));

  // Stage-typed carton captures list PO-level (RECEIVING-entity) photos only —
  // item shots never mix into a carton gallery/prior strip. Stage-less legacy
  // callers (old gallery routes) keep the historical `all` union.
  const { priorPhotos, deletePhoto, query } = useScopedReceivingPhotos({
    ...scope,
    photosListScope:
      scope.photosListScope ??
      (scope.receivingLineId != null ? undefined : scope.stage ? 'po' : 'all'),
  });

  const returnToCaller = useCallback(() => {
    router.replace(returnHref);
  }, [router, returnHref]);

  useEffect(() => {
    if (notifyStaffId <= 0 || !phoneChannelName) return;

    const publishTaken = async (notice: {
      receivingId: number;
      receivingLineId: number | null;
      inFlight: number;
    }) => {
      try {
        const client = await getClient();
        if (!client) return;
        const ch = client.channels.get(phoneChannelName);
        await ch.publish('receiving_photo_taken', {
          receiving_id: notice.receivingId,
          receiving_line_id: notice.receivingLineId,
          in_flight: notice.inFlight,
          ...(requestId ? { request_id: requestId } : {}),
        });
      } catch (err) {
        console.warn('photo queue: receiving_photo_taken publish failed', err);
      }
    };

    photoUploadQueue.configureTakenNotifier((notice) => {
      void publishTaken(notice);
    });

    photoUploadQueue.configureNotifier(async (notice) => {
      try {
        notifyReceivingPhotoChanged(queryClient, {
          action: 'insert',
          receivingId: notice.receivingId,
          photoIds: [notice.photoId],
        });
        const client = await getClient();
        if (!client) return;
        const ch = client.channels.get(phoneChannelName);
        await ch.publish('receiving_photo_uploaded', {
          receiving_id: notice.receivingId,
          receiving_line_id: notice.receivingLineId,
          photo_id: notice.photoId,
          photo_url: notice.photoUrl,
          ...(requestId ? { request_id: requestId } : {}),
        });
      } catch (err) {
        console.warn('photo queue: receiving_photo_uploaded publish failed', err);
      }
    });
  }, [getClient, notifyStaffId, phoneChannelName, queryClient, requestId]);

  const handleDeletePrior = useCallback(
    async (photoId: number) => {
      const ok = await deletePhoto(photoId);
      if (!ok) return;
      notifyReceivingPhotoChanged(queryClient, {
        action: 'delete',
        receivingId: scope.receivingId,
        photoIds: [photoId],
      });
    },
    [deletePhoto, queryClient, scope.receivingId],
  );

  const enqueueShots = useCallback(
    (shots: CapturedShot[], aspect?: PhotoAspect | null) => {
      const existingCount = query.data?.photos?.length ?? 0;
      shots.forEach((s, index) => {
        photoUploadQueue.enqueue(
          {
            ...scope,
            aspect: aspect ?? scope.aspect ?? null,
            fileIndex: existingCount + index + 1,
            capturedAtMs: s.capturedAtMs,
          },
          s.blob,
          s.previewUrl,
        );
      });
    },
    [query.data?.photos?.length, scope],
  );

  // ── Legacy spam-capture path (unchanged) ──────────────────────────────────
  const handleDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length === 0) {
        returnToCaller();
        return;
      }
      enqueueShots(shots);
      toast.message(`Uploading ${shots.length} photo${shots.length === 1 ? '' : 's'}…`, {
        description: 'Saving to storage in the background.',
        position: 'top-center',
        duration: 5000,
      });
      returnToCaller();
    },
    [enqueueShots, returnToCaller],
  );

  // Guided only for the door stage — other stages keep spam capture.
  const guidedArrival =
    guided && effectiveReceivingPhotoStage(scope) === 'arrival_package';

  const [step, setStep] = useState<ArrivalGuidedStep>(initialStep);

  const onLabelDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length > 0) enqueueShots(shots, 'shipping_label');
      setStep('box_exterior');
    },
    [enqueueShots],
  );

  const onBoxDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length > 0) enqueueShots(shots, 'box_exterior');
      const n = shots.length;
      if (n > 0) {
        toast.message(`Uploading ${n} photo${n === 1 ? '' : 's'}…`, {
          description: 'Saving to storage in the background.',
          position: 'top-center',
          duration: 5000,
        });
      }
      returnToCaller();
    },
    [enqueueShots, returnToCaller],
  );

  if (mode === 'gallery') {
    return <MobileReceivingSwipeGallery scope={scope} returnHref={backHref || returnHref} />;
  }

  if (!guidedArrival) {
    return (
      <MobilePackerSpamCamera
        embedded
        onDone={handleDone}
        onCancel={returnToCaller}
        maxPhotos={maxPhotos}
        priorPhotos={priorPhotos}
        onDeletePrior={handleDeletePrior}
        header={
          <StudioHeader
            eyebrow={
              scope.stage || scope.receivingLineId != null
                ? photoStageLabel(effectiveReceivingPhotoStage(scope))
                : 'Add unboxing photos'
            }
            label={headerLabel}
          />
        }
      />
    );
  }

  const stepIndex = ARRIVAL_GUIDED_STEPS.indexOf(step);
  const isLabel = step === 'shipping_label';
  const aspectLabel = photoAspectLabel(step);

  return (
    <MobilePackerSpamCamera
      key={step}
      embedded
      onDone={isLabel ? onLabelDone : onBoxDone}
      onCancel={isLabel ? returnToCaller : () => setStep('shipping_label')}
      maxPhotos={maxPhotos}
      priorPhotos={priorPhotos}
      onDeletePrior={handleDeletePrior}
      gateCapture={isLabel}
      header={
        <StudioHeader
          eyebrow={`Step ${stepIndex + 1} of ${ARRIVAL_GUIDED_STEPS.length} · ${aspectLabel}`}
          label={
            isLabel
              ? 'Capture the shipping label flat'
              : `Capture the box · ${headerLabel}`
          }
        />
      }
    />
  );
}

function StudioHeader({ eyebrow, label }: { eyebrow: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-role-micro text-white/60">{eyebrow}</p>
      <p className="truncate text-sm font-semibold text-white">{label}</p>
    </div>
  );
}
