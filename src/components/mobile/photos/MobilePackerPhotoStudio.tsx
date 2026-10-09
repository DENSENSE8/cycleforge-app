'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Camera, Loader2, Printer } from '@/components/Icons';
import { MobileV2OrderPaperworkSheet } from '@/components/mobile/v2/orders/MobileV2OrderPaperworkSheet';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';
import { MobileContinuousPhotoCamera } from '@/components/mobile/photos/MobileContinuousPhotoCamera';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { shutterCaptureTime } from '@/lib/photos/capture-time';
import { canUseContinuousWebCamera, captureFileName } from '@/lib/photos/capture-session';
import {
  packerPhotoUploadQueue,
  useClearPackerDoneOnUnmount,
  usePackerUploadQueue,
} from '@/components/mobile/packer/PackerPhotoUploadQueue';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { submitPackVerification } from '@/lib/packing/pack-verify-flow';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface MobilePackerPhotoStudioProps {
  packerLogId: number;
  orderId: string;
  orderRowId?: number | null;
  /** `Order 123` / `Pack PL-7` — painted under the title, top-left of the camera. */
  headerLabel: string;
  /** Product title from the opener (`?title=`); null paints only the order line. */
  productTitle?: string | null;
  returnHref: string;
  /** ✓ opens Verify & finish (tracking cross-check). Off = ✓ returns straight to `returnHref`. */
  guided?: boolean;
  /** Complete a phone-started CAPTURING pack after evidence + verification. */
  completePacking?: boolean;
  scanClientEventId?: string | null;
  mobileScanEventId?: number | null;
}

/**
 * Immersive pack photo capture (owner 2026-10-08): one camera step, title +
 * order id top-left. Every shutter press is queued for upload IMMEDIATELY
 * (`packerPhotoUploadQueue` → `POST /api/photos/upload`, PACKER_LOG link), so a
 * shot survives a reload, a close or a crash — nothing waits for ✓.
 */
export function MobilePackerPhotoStudio({
  packerLogId,
  orderId,
  orderRowId = null,
  headerLabel,
  productTitle = null,
  returnHref,
  guided = false,
  completePacking = false,
  scanClientEventId = null,
  mobileScanEventId = null,
}: MobilePackerPhotoStudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { execute: executeWmsCommand } = useWmsRealtime();
  useClearPackerDoneOnUnmount();

  const { priorPhotos, deletePrior, queryKey, query } = useScopedPackerPhotos(packerLogId);
  const queueEntries = usePackerUploadQueue(packerLogId);
  const [paperworkOpen, setPaperworkOpen] = useState(false);

  const returnToPack = useCallback(() => {
    router.replace(returnHref);
  }, [router, returnHref]);

  useEffect(() => {
    packerPhotoUploadQueue.configureNotifier((notice) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['packer-photos', notice.packerLogId] });
      queryClient.invalidateQueries({ queryKey: ['packer-logs-mobile'] });
      queryClient.invalidateQueries({ queryKey: ['packing-photo-feed'] });
    });
  }, [queryClient, queryKey]);
  useEffect(() => {
    if (query.isError) toast.error('Could not load saved packing photos.', { position: 'top-center' });
  }, [query.isError]);

  // A failed upload must never be silent: one toast per failed shot, with Retry.
  const toastedFailuresRef = useRef(new Set<string>());
  useEffect(() => {
    for (const entry of queueEntries) {
      if (entry.state !== 'failed' || toastedFailuresRef.current.has(entry.id)) continue;
      toastedFailuresRef.current.add(entry.id);
      toast.error(`Photo did not upload: ${entry.error || 'network error'}`, {
        position: 'top-center',
        action: {
          label: 'Retry',
          onClick: () => {
            toastedFailuresRef.current.delete(entry.id);
            packerPhotoUploadQueue.retry(entry.id);
          },
        },
      });
    }
  }, [queueEntries]);

  const handleDeletePrior = useCallback(
    async (photoId: number) => {
      try {
        await deletePrior(photoId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not delete packing photo.', { position: 'top-center' });
      }
    },
    [deletePrior],
  );

  // ── Camera (the shared `MobileContinuousPhotoCamera`, no packing fork) ─────
  const [shotCount, setShotCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  // Decided on the client: `navigator.mediaDevices` is absent on the server and on insecure origins.
  const [cameraState, setCameraState] = useState<'pending' | 'live' | 'unsupported'>('pending');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  useEffect(() => {
    setCameraState(canUseContinuousWebCamera() ? 'live' : 'unsupported');
  }, []);

  const retryCamera = useCallback(() => {
    setCameraError(null);
    setCameraKey((key) => key + 1);
  }, []);

  // Back from the lock screen / another app: reopen the lens without a tap.
  useEffect(() => {
    if (!cameraError) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') retryCamera();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [cameraError, retryCamera]);

  // Every shutter press is queued for upload at once — nothing waits for ✓.
  const onCapture = useCallback(
    async (blob: Blob) => {
      setProcessing(true);
      try {
        const capturedAtMs = shutterCaptureTime();
        const compressed = await compressPhotoForUpload(
          new File([blob], captureFileName(capturedAtMs), { type: blob.type || 'image/jpeg', lastModified: capturedAtMs }),
          { quality: 0.85, source: 'mobile-web-camera' },
        );
        const next = shotCount + 1;
        packerPhotoUploadQueue.enqueue(
          {
            packerLogId,
            orderId,
            fileIndex: (query.data?.photos?.length ?? 0) + next,
            capturedAtMs,
          },
          compressed.blob,
          URL.createObjectURL(compressed.blob),
        );
        setShotCount(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not prepare the photo.', { position: 'top-center' });
      } finally {
        setProcessing(false);
      }
    },
    [orderId, packerLogId, query.data?.photos?.length, shotCount],
  );

  // Review = saved photos (deletable) + shots still uploading (not yet deletable).
  const slides = useMemo<Array<SwipePhotoSlide & { photoId?: number }>>(
    () => [
      ...priorPhotos.map((photo) => ({
        id: photo.id,
        previewUrl: photo.fullUrl ?? photo.previewUrl,
        photoId: photo.photoId,
        deletable: photo.photoId != null,
      })),
      ...queueEntries
        .filter((entry) => entry.state !== 'done')
        .map((entry) => ({ id: `queue-${entry.id}`, previewUrl: entry.previewUrl, deletable: false })),
    ],
    [priorPhotos, queueEntries],
  );

  // ── Verify & finish (guided) ──────────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);
  const [tracking, setTracking] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const verificationCommandIdRef = useRef<string | null>(scanClientEventId);

  const onConfirm = useCallback(async () => {
    if (!user) {
      toast.error('Sign in again before finishing this pack.', { position: 'top-center' });
      return;
    }
    setSubmitting(true);
    try {
      verificationCommandIdRef.current ??= safeRandomUUID();
      if (completePacking) {
        // Do not record a successful pack verification ahead of evidence that
        // is still only in the browser's retry queue.
        await packerPhotoUploadQueue.waitForScope(packerLogId);
      }
      const result = await submitPackVerification({
        packerLogId,
        tracking: tracking.trim() || null,
        clientEventId: verificationCommandIdRef.current,
      }, executeWmsCommand, {
        organizationId: user.organizationId,
        staffId: user.staffId,
      });
      if (result.outcome === 'VERIFIED') {
        if (completePacking) {
          // The server recounts the already-durable evidence while it holds
          // the draft row lock, then promotes it to the one completed fact.
          const response = await fetch('/api/packing-logs/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': verificationCommandIdRef.current,
            },
            body: JSON.stringify({
              shippingTrackingNumber: tracking.trim(),
              trackingType: 'ORDERS',
              orderId,
              draftPackerLogId: packerLogId,
              clientEventId: verificationCommandIdRef.current,
              mobileScanEventId,
            }),
          });
          const body = await response.json().catch(() => null) as { error?: string; details?: string } | null;
          if (!response.ok) {
            throw new Error(body?.details || body?.error || 'Could not finalize this pack.');
          }
          toast.success('Packed — ready for dock staging', { position: 'top-center' });
        } else {
          toast.success('Verified — sent to review', { position: 'top-center' });
        }
      } else if (result.outcome === 'ERROR_MISSING_TRACKING') {
        toast.error('Tracking not matched — flagged for manager review', { position: 'top-center' });
      } else {
        toast.message('Saved — sent to review', { position: 'top-center' });
      }
      returnToPack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish packing.', { position: 'top-center' });
      setSubmitting(false);
    }
  }, [completePacking, executeWmsCommand, mobileScanEventId, orderId, packerLogId, returnToPack, tracking, user]);

  const paperwork = orderRowId ? (
    <MobileV2OrderPaperworkSheet
      open={paperworkOpen}
      onClose={() => setPaperworkOpen(false)}
      orderId={orderRowId}
      orderRef={orderId}
      pack={{ packerLogId }}
    />
  ) : null;

  if (confirming) {
    return (
      <>
        <PackVerifyConfirm
          orderId={orderId}
          tracking={tracking}
          onTrackingChange={setTracking}
          submitting={submitting}
          onConfirm={onConfirm}
          onBack={() => setConfirming(false)}
          onPaperwork={orderRowId ? () => setPaperworkOpen(true) : undefined}
        />
        {paperwork}
      </>
    );
  }

  const latest = slides.at(-1);
  const blockedMessage =
    cameraState === 'unsupported'
      ? 'This browser cannot open the camera. Open CycleForge over https in Safari or Chrome.'
      : cameraError;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-black text-white" data-testid="mobile-packer-camera">
      {cameraState === 'live' && !cameraError ? (
        <MobileContinuousPhotoCamera
          key={cameraKey}
          count={shotCount}
          processing={processing}
          onCapture={onCapture}
          onClose={returnToPack}
          onDone={guided ? () => setConfirming(true) : returnToPack}
          onUnavailable={setCameraError}
          bottomLeft={
            latest ? (
              // ds-raw-button: a photo tile in the camera's bottom-left thumb slot (pinned camera chrome).
              <button
                type="button"
                onClick={() => setReviewIndex(slides.length - 1)}
                aria-label={`Review ${slides.length} photo${slides.length === 1 ? '' : 's'}`}
                className="pointer-events-auto relative h-14 w-14 overflow-hidden rounded-mode border-2 border-white/80 bg-black/60 active:scale-95"
                data-testid="mobile-packer-camera-review"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={latest.previewUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : <span aria-hidden />
          }
          overlay={
            <div className={cn('max-w-full bg-black/55 px-3 py-2 backdrop-blur-md', cornerClass('control'))}>
              {productTitle ? <p className="text-sm font-semibold text-white">{productTitle}</p> : null}
              <p className="font-mono text-role-caption text-white/80">{headerLabel}</p>
            </div>
          }
        />
      ) : null}

      {blockedMessage ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Camera className="h-10 w-10 text-white/50" />
          <p className="text-sm font-semibold text-white/85">{blockedMessage}</p>
          {cameraState === 'live' ? (
            <Button type="button" variant="secondary" size="lg" onClick={retryCamera} data-testid="mobile-packer-camera-retry">
              Retry camera
            </Button>
          ) : null}
          <Button type="button" variant="glass" size="lg" onClick={returnToPack} className="text-white">
            Close
          </Button>
        </div>
      ) : null}

      <MobileSwipePhotoViewer
        open={reviewIndex != null}
        initialIndex={reviewIndex ?? 0}
        slides={slides}
        onClose={() => setReviewIndex(null)}
        onDelete={(slide) => {
          const photoId = slides.find((candidate) => candidate.id === slide.id)?.photoId;
          if (photoId != null) void handleDeletePrior(photoId);
        }}
      />
    </div>
  );
}

/** Final confirm sheet: cross-check tracking, then submit the verification. */
function PackVerifyConfirm({
  orderId,
  tracking,
  onTrackingChange,
  submitting,
  onConfirm,
  onBack,
  onPaperwork,
}: {
  orderId: string;
  tracking: string;
  onTrackingChange: (v: string) => void;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onPaperwork?: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-between bg-stage px-5 py-6 text-white">
      <div className="space-y-4">
        <div>
          <p className="text-role-micro text-white/60">Verify & finish</p>
          <p className="truncate text-lg font-semibold text-white">
            {orderId.startsWith('PL-') ? `Pack ${orderId}` : `Order ${orderId}`}
          </p>
        </div>
        {onPaperwork ? (
          <Button variant="glass" size="sm" icon={<Printer />} onClick={onPaperwork} className="border border-white/20 text-white">
            Paperwork + label
          </Button>
        ) : null}
        <p className="text-role-caption text-white/70">
          Enter the tracking number on the label to confirm it matches this order.
        </p>
        <label className="block space-y-1">
          <span className="text-role-micro text-white/60">
            Tracking on label
          </span>
          <input
            value={tracking}
            onChange={(e) => onTrackingChange(e.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Scan or type the tracking #"
            className={cn("w-full rounded-none border border-white/15 bg-white/5 px-3 py-3 font-mono text-role-field text-white placeholder:text-white/30", focusRing('field', 'accent'))} // ds-allow-raw-neutral: photo-stage overlay field
          />
        </label>
      </div>

      <div className="space-y-2 pt-6">
        <Button
          type="button"
          variant="success"
          onClick={onConfirm}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-none px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Submitting…' : 'Verify & finish'}
        </Button>
        <Button
          type="button"
          variant="glass"
          onClick={onBack}
          disabled={submitting}
          className="w-full rounded-none border border-white/15 px-4 py-3 text-sm font-semibold text-white/80 disabled:opacity-60"
        >
          Back to photos
        </Button>
      </div>
    </div>
  );
}
