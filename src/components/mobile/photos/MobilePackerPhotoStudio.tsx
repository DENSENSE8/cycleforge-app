'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';
import {
  MobilePackerSpamCamera,
  type CapturedShot,
} from '@/components/mobile/station/MobilePackerSpamCamera';
import {
  packerPhotoUploadQueue,
  useClearPackerDoneOnUnmount,
  type PackerPhotoScope,
} from '@/components/mobile/packer/PackerPhotoUploadQueue';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { PACK_SLIP_PHOTO_TYPE, PACK_BOX_PHOTO_TYPE } from '@/lib/photos/types';
import { submitPackVerification, extractTrackingCandidate } from '@/lib/packing/pack-verify-flow';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



type GuidedCaptureStep = 'slip' | 'box';

export interface MobilePackerPhotoStudioProps {
  packerLogId: number;
  orderId: string;
  headerLabel: string;
  returnHref: string;
  maxPhotos?: number;
  /**
   * When set, run the guided Packer Review flow (plan §2b): slip → box →
   * confirm, threading pack_slip/pack_box photo types and firing the
   * tracking-verify submit on finish. Omit for the legacy spam-capture path.
   */
  guided?: boolean;
  /** Guided entry step (from `?step=`); defaults to slip. */
  initialStep?: GuidedCaptureStep;
  /** Complete a phone-started CAPTURING pack after evidence + verification. */
  completePacking?: boolean;
}

/** Immersive pack photo capture — legacy spam mirror + the guided Review flow. */
export function MobilePackerPhotoStudio({
  packerLogId,
  orderId,
  headerLabel,
  returnHref,
  maxPhotos = 10,
  guided = false,
  initialStep = 'slip',
  completePacking = false,
}: MobilePackerPhotoStudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { execute: executeWmsCommand } = useWmsRealtime();
  useClearPackerDoneOnUnmount();

  const scope = useMemo<PackerPhotoScope>(
    () => ({ packerLogId, orderId }),
    [packerLogId, orderId],
  );

  const { priorPhotos, deletePrior, queryKey, query } = useScopedPackerPhotos(packerLogId);

  const returnToPack = useCallback(() => {
    router.replace(returnHref);
  }, [router, returnHref]);

  useEffect(() => {
    packerPhotoUploadQueue.configureNotifier((notice) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['packer-photos', notice.packerLogId] });
      queryClient.invalidateQueries({ queryKey: ['packer-logs-mobile'] });
    });
  }, [queryClient, queryKey]);

  const handleDeletePrior = useCallback(
    async (photoId: number) => {
      await deletePrior(photoId);
    },
    [deletePrior],
  );

  const enqueueShots = useCallback(
    (shots: CapturedShot[], photoType?: string) => {
      const existingCount = query.data?.photos?.length ?? 0;
      shots.forEach((s, index) => {
        packerPhotoUploadQueue.enqueue(
          {
            ...scope,
            photoType: photoType ?? null,
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
        returnToPack();
        return;
      }
      enqueueShots(shots);
      toast.message(`Uploading ${shots.length} photo${shots.length === 1 ? '' : 's'}…`, {
        description: 'Saving to storage in the background.',
        position: 'top-center',
        duration: 5000,
      });
      returnToPack();
    },
    [enqueueShots, returnToPack],
  );

  // ── Guided slip → box → confirm flow (plan §2b/§2d) ────────────────────────
  const [step, setStep] = useState<GuidedCaptureStep | 'confirm'>(initialStep);
  const [tracking, setTracking] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [slipBlob, setSlipBlob] = useState<Blob | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const verificationCommandIdRef = useRef<string | null>(null);

  const onSlipDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length > 0) enqueueShots(shots, PACK_SLIP_PHOTO_TYPE);
      // Retain the first slip shot for the optional OCR pre-fill on confirm.
      if (shots[0]) setSlipBlob(shots[0].blob);
      setStep('box');
    },
    [enqueueShots],
  );

  // §2c OCR assist — read the tracking off the retained slip shot on the LAN
  // vision box and PRE-FILL it (never auto-submit). The vision client is a
  // dynamic import so it never rides the station bundle (build-gotchas altitude).
  const scanFromSlip = useCallback(async () => {
    if (!slipBlob) return;
    setOcrBusy(true);
    try {
      const { identifyLabelFromVisionBox } = await import('@/lib/vision-identify');
      const res = await identifyLabelFromVisionBox(slipBlob, false);
      const candidate = res.ok ? extractTrackingCandidate(res.raw_text) : null;
      if (candidate) {
        setTracking(candidate);
        toast.success('Tracking read from slip — confirm it', { position: 'top-center' });
      } else {
        toast.message('No tracking read — enter it manually', { position: 'top-center' });
      }
    } catch {
      toast.error('OCR unavailable — enter tracking manually', { position: 'top-center' });
    } finally {
      setOcrBusy(false);
    }
  }, [slipBlob]);

  // Auto-kick OCR once when the confirm sheet opens with a retained slip shot —
  // operator still confirms; this is the assist, not an auto-submit.
  const ocrAutoRanRef = useRef(false);
  useEffect(() => {
    if (step !== 'confirm' || !slipBlob || ocrAutoRanRef.current) return;
    ocrAutoRanRef.current = true;
    void scanFromSlip();
  }, [step, slipBlob, scanFromSlip]);

  const onBoxDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length > 0) enqueueShots(shots, PACK_BOX_PHOTO_TYPE);
      setStep('confirm');
    },
    [enqueueShots],
  );

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
    } catch {
      toast.error('Could not submit verification. Photos are still saved.', { position: 'top-center' });
      setSubmitting(false);
    }
  }, [completePacking, executeWmsCommand, orderId, packerLogId, returnToPack, tracking, user]);

  if (!guided) {
    return (
      <MobilePackerSpamCamera
        embedded
        onDone={handleDone}
        onCancel={returnToPack}
        maxPhotos={maxPhotos}
        priorPhotos={priorPhotos}
        onDeletePrior={handleDeletePrior}
        header={<StudioHeader eyebrow="Add pack photos" label={headerLabel} />}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <PackVerifyConfirm
        orderId={orderId}
        tracking={tracking}
        onTrackingChange={setTracking}
        submitting={submitting}
        onConfirm={onConfirm}
        onBack={() => setStep('box')}
        canScan={!!slipBlob}
        ocrBusy={ocrBusy}
        onScanFromSlip={scanFromSlip}
      />
    );
  }

  const isSlip = step === 'slip';
  return (
    <MobilePackerSpamCamera
      key={step}
      embedded
      onDone={isSlip ? onSlipDone : onBoxDone}
      onCancel={isSlip ? returnToPack : () => setStep('slip')}
      maxPhotos={maxPhotos}
      priorPhotos={priorPhotos}
      onDeletePrior={handleDeletePrior}
      gateCapture={isSlip}
      header={
        <StudioHeader
          eyebrow={isSlip ? 'Step 1 of 2 · Packing slip' : 'Step 2 of 2 · Box'}
          label={isSlip ? 'Capture the packing slip flat' : `Capture the box · ${headerLabel}`}
        />
      }
    />
  );
}

function StudioHeader({ eyebrow, label }: { eyebrow: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-role-micro uppercase tracking-[0.22em] text-white/60">{eyebrow}</p>
      <p className="truncate text-sm font-semibold text-white">{label}</p>
    </div>
  );
}

/** Final confirm sheet: cross-check tracking, then submit the verification. The
 *  manual field is the floor-reliability path (plan §2c) — OCR pre-fill layers on
 *  top of it. Gate-fail coaching copy is kept verbatim from the sketch. */
function PackVerifyConfirm({
  orderId,
  tracking,
  onTrackingChange,
  submitting,
  onConfirm,
  onBack,
  canScan,
  ocrBusy,
  onScanFromSlip,
}: {
  orderId: string;
  tracking: string;
  onTrackingChange: (v: string) => void;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  canScan: boolean;
  ocrBusy: boolean;
  onScanFromSlip: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-between bg-stage px-5 py-6 text-white">
      <div className="space-y-4">
        <div>
          <p className="text-role-micro uppercase tracking-[0.22em] text-white/60">Verify & finish</p>
          <p className="truncate text-lg font-semibold text-white">
            {orderId.startsWith('PL-') ? `Pack ${orderId}` : `Order ${orderId}`}
          </p>
        </div>
        <p className="text-role-caption text-white/70">
          Ensure lighting is clear, avoid blur, and hold the slip flat. Enter the tracking
          number from the slip to confirm it matches this order.
        </p>
        <label className="block space-y-1">
          <span className="text-role-micro uppercase tracking-widest text-white/60">
            Tracking on slip
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
        {canScan ? (
          <Button
            type="button"
            variant="glass"
            onClick={onScanFromSlip}
            disabled={ocrBusy || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-none border border-white/15 px-3 py-2.5 text-role-caption font-semibold text-white/80 disabled:opacity-60"
          >
            {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {ocrBusy ? 'Reading slip…' : 'Read tracking from slip'}
          </Button>
        ) : null}
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
          Back to box photos
        </Button>
      </div>
    </div>
  );
}
