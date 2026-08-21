'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/design-system/motion';
import {
  framerPresenceMobile,
  framerTransitionMobile,
} from '@/design-system/foundations/motion-framer';
import { Camera, X, Check } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { useCamera } from '@/hooks/useCamera';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { shutterCaptureTime } from '@/lib/photos/capture-time';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import {
  gateStillFrame,
  PACK_SLIP_GATE_COACHING,
  type GateReason,
} from '@/lib/vision/frame-quality';
import { toast } from '@/lib/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CapturedShot {
  id: string;
  blob: Blob;
  previewUrl: string;
  /**
   * Shutter instant (epoch ms) — stamped at the FRAME GRAB, before `toBlob` and
   * `compressPhotoForUpload`, which together can run for a noticeable fraction
   * of a second on a warehouse phone.
   *
   * Required, not defaulted: this camera is the only place a `CapturedShot` is
   * born, and a canvas capture has no `File.lastModified` to fall back on, so a
   * shot that reaches the queue without it has silently lost the only capture
   * time that will ever exist. Making it required turns "a new capture path
   * forgot to stamp" into a compile error instead of a null column an operator
   * discovers during a carrier dispute.
   */
  capturedAtMs: number;
}

/** Already-saved photos for this PO/line — shown in the bottom-left gallery bubble. */
export interface PriorPhoto {
  id: string;
  previewUrl: string;
  /** DB id — when set, delete removes the committed photo from the server. */
  photoId?: number;
}

type GallerySlide =
  | { kind: 'prior'; id: string; previewUrl: string }
  | { kind: 'capture'; id: string; previewUrl: string; blob: Blob };

const GATE_DIM = 160;

export interface MobilePackerSpamCameraProps {
  /**
   * Called when the operator leaves the camera with photos — via the checkmark
   * OR the X close. Parent owns the blobs after this and is responsible for
   * uploading them, so no shot is ever lost by exiting "the wrong way".
   */
  onDone: (shots: CapturedShot[]) => void;
  /** Called only when the operator closes an EMPTY camera (no captured photos). */
  onCancel: () => void;
  /** Max photos allowed in one batch. */
  maxPhotos?: number;
  /** JPEG quality 0..1. */
  jpegQuality?: number;
  /** Optional header label above the viewfinder. */
  header?: React.ReactNode;
  /** Committed photos for this scope — merged into the swipe gallery (read-only). */
  priorPhotos?: PriorPhoto[];
  /** Remove a previously saved photo (by DB id) from the swipe gallery. */
  onDeletePrior?: (photoId: number) => void | Promise<void>;
  /**
   * When true, render in the route tree (immersive layout) instead of portaling
   * to document.body. The swipe viewer still portals for z-index stacking.
   */
  embedded?: boolean;
  /**
   * When true, run the still-frame quality gate on every shutter (plan §2c —
   * Packer Review slip capture). Rejected shots never enter the gallery; the
   * operator sees the lighting/blur coaching toast and retries.
   */
  gateCapture?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * MobilePackerSpamCamera — fullscreen rapid-capture camera.
 *
 * Behaviour:
 *  • Reuses `useCamera()` (which owns getUserMedia + stop lifecycle).
 *  • Full-bleed viewfinder; controls float over a scrim so framing is WYSIWYG.
 *  • Capture is cropped to the on-screen viewfinder aspect ratio, so the stored
 *    blob and the gallery preview match exactly what was framed (no
 *    object-cover-vs-object-contain size mismatch between capture and review).
 *  • Each shot is canvased, `toBlob`d as JPEG, then routed through
 *    `compressPhotoForUpload` so the stored blob matches the server's input.
 *  • Photos accumulate locally — NO network calls. The last shot surfaces as a
 *    circular gallery button (bottom-left); tapping opens a swipeable review
 *    overlay with per-photo delete.
 *  • On Done, ownership of the blobs transfers to the parent (object URLs are
 *    NOT revoked here). On unmount without Done, all object URLs are revoked.
 */
export function MobilePackerSpamCamera({
  onDone,
  onCancel,
  maxPhotos = 5,
  jpegQuality = 0.85,
  header,
  priorPhotos = [],
  onDeletePrior,
  embedded = false,
  gateCapture = false,
}: MobilePackerSpamCameraProps) {
  const { videoRef, startCamera, stopCamera, cameraError } = useCamera();
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const gateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [flash, setFlash] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [startError, setStartError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [gateHint, setGateHint] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Track whether the parent took ownership — if so, skip revoke-on-unmount.
  const handedOffRef = useRef(false);
  // Always-current shots reference for unmount cleanup.
  const shotsRef = useRef<CapturedShot[]>([]);
  shotsRef.current = shots;

  const gallerySlides = useMemo<GallerySlide[]>(
    () => [
      ...priorPhotos.map((p) => ({ kind: 'prior' as const, id: p.id, previewUrl: p.previewUrl })),
      ...shots.map((s) => ({
        kind: 'capture' as const,
        id: s.id,
        previewUrl: s.previewUrl,
        blob: s.blob,
      })),
    ],
    [priorPhotos, shots],
  );
  const slidesRef = useRef(gallerySlides);
  slidesRef.current = gallerySlides;

  useEffect(() => {
    setPreviewIndex((idx) => {
      if (idx === null) return idx;
      if (gallerySlides.length === 0) return null;
      return Math.min(idx, gallerySlides.length - 1);
    });
  }, [gallerySlides.length]);

  // ── Camera start with resolution fallback ────────────────────────────────
  const attemptStart = useCallback(async () => {
    setStartError(false);
    const chain: Array<{ width?: { ideal: number }; height?: { ideal: number } }> = [
      { width: { ideal: 1280 }, height: { ideal: 720 } },
      {},
    ];
    for (const c of chain) {
      try {
        await startCamera({ facingMode: 'environment', ...c });
        return;
      } catch {
        // try next
      }
    }
    setStartError(true);
  }, [startCamera]);

  useEffect(() => {
    void attemptStart();
    return () => stopCamera();
  }, [attemptStart, stopCamera]);

  // Revoke object URLs on unmount unless the parent took ownership.
  useEffect(() => {
    return () => {
      if (handedOffRef.current) return;
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  // ── Shutter ─────────────────────────────────────────────────────────────
  const shutter = useCallback(async () => {
    if (shots.length >= maxPhotos) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Crop the source frame to the on-screen viewfinder aspect ratio so the
    // saved photo equals exactly what the operator framed (the live view is
    // object-cover, so without this crop the gallery would reveal the
    // letterboxed edges the viewfinder hid).
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const box = viewfinderRef.current?.getBoundingClientRect();
    const displayAspect = box && box.height > 0 ? box.width / box.height : vw / vh;
    const videoAspect = vw / vh;

    let sx = 0;
    let sy = 0;
    let sWidth = vw;
    let sHeight = vh;
    if (videoAspect > displayAspect) {
      // Source is wider than the viewfinder → crop the left/right.
      sWidth = Math.round(vh * displayAspect);
      sx = Math.round((vw - sWidth) / 2);
    } else {
      // Source is taller than the viewfinder → crop the top/bottom.
      sHeight = Math.round(vw / displayAspect);
      sy = Math.round((vh - sHeight) / 2);
    }

    // Still-frame quality gate (plan §2c) — cheap downscale before we keep the shot.
    if (gateCapture) {
      if (!gateCanvasRef.current) gateCanvasRef.current = document.createElement('canvas');
      const gc = gateCanvasRef.current;
      const gh = Math.max(1, Math.round((GATE_DIM * sHeight) / sWidth));
      gc.width = GATE_DIM;
      gc.height = gh;
      const gctx = gc.getContext('2d', { willReadFrequently: true });
      if (gctx) {
        gctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, GATE_DIM, gh);
        const imageData = gctx.getImageData(0, 0, GATE_DIM, gh);
        const gate = gateStillFrame(imageData);
        if (!gate.ok) {
          const reason: GateReason = gate.reason;
          setGateHint(PACK_SLIP_GATE_COACHING);
          toast.message(PACK_SLIP_GATE_COACHING, {
            description: reason === 'ok' ? undefined : reason.replace('-', ' '),
            position: 'top-center',
            duration: 3500,
          });
          return;
        }
        setGateHint(null);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    // The frame is now grabbed — this is the shutter instant the operator saw.
    // Read it BEFORE the encode + compress below, which are async and can cost
    // a visible fraction of a second on a warehouse phone.
    const capturedAtMs = shutterCaptureTime();

    const rawBlob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', jpegQuality),
    );
    if (!rawBlob) return;

    const compressed = await compressPhotoForUpload(rawBlob, { source: 'packer-spam' });
    const blob = compressed.blob;
    const previewUrl = URL.createObjectURL(blob);
    const id = safeRandomUUID();

    setShots((prev) => [...prev, { id, blob, previewUrl, capturedAtMs }]);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
  }, [shots.length, maxPhotos, jpegQuality, videoRef, gateCapture]);

  // ── Gallery paging ────────────────────────────────────────────────────────
  const openGallery = useCallback(() => {
    if (slidesRef.current.length === 0) return;
    setPreviewIndex(slidesRef.current.length - 1);
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((s) => s.id !== id);
      setPreviewIndex((idx) => {
        if (idx === null) return idx;
        const priorCount = priorPhotos.length;
        const captureCount = next.length;
        const total = priorCount + captureCount;
        if (total === 0) return null;
        return Math.min(idx, total - 1);
      });
      return next;
    });
  }, [priorPhotos.length]);

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      gallerySlides.map((slide) => {
        if (slide.kind === 'capture') {
          return { id: slide.id, previewUrl: slide.previewUrl, deletable: true };
        }
        const prior = priorPhotos.find((p) => p.id === slide.id);
        return {
          id: slide.id,
          previewUrl: slide.previewUrl,
          deletable: prior?.photoId != null && typeof onDeletePrior === 'function',
        };
      }),
    [gallerySlides, onDeletePrior, priorPhotos],
  );

  const handleViewerDelete = useCallback(
    (slide: SwipePhotoSlide) => {
      const match = gallerySlides.find((s) => s.id === slide.id);
      if (!match) return;
      if (match.kind === 'capture') {
        removeShot(match.id);
        return;
      }
      const prior = priorPhotos.find((p) => p.id === match.id);
      if (prior?.photoId != null && onDeletePrior) void onDeletePrior(prior.photoId);
    },
    [gallerySlides, onDeletePrior, priorPhotos, removeShot],
  );

  // ── Done ─────────────────────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    handedOffRef.current = true;
    onDone(shots);
  }, [onDone, shots]);

  // ── Close / back ───────────────────────────────────────────────────────────
  // Closing with the X must NOT discard work: any captured shots are committed
  // (handed off + uploaded) exactly as if the operator had tapped the checkmark.
  // Only a genuinely empty camera is a plain cancel.
  const handleCancel = useCallback(() => {
    if (shots.length > 0) {
      handedOffRef.current = true;
      onDone(shots);
      return;
    }
    onCancel();
  }, [shots, onDone, onCancel]);

  // Dev-only escape hatch: localhost Safari blocks getUserMedia, so there's
  // no way to exercise the post-capture upload flow. Synthesizes a 1280x720
  // placeholder JPEG and hands it to the parent as if it were a real shot.
  const handleUseTestPhoto = useCallback(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TEST PHOTO', canvas.width / 2, canvas.height / 2 - 24);
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillText(new Date().toLocaleString(), canvas.width / 2, canvas.height / 2 + 32);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', jpegQuality),
    );
    if (!blob) return;

    const previewUrl = URL.createObjectURL(blob);
    const id = safeRandomUUID();

    handedOffRef.current = true;
    onDone([{ id, blob, previewUrl, capturedAtMs: shutterCaptureTime() }]);
  }, [jpegQuality, onDone]);

  // Only surface the test-photo escape hatch in dev builds so it never reaches
  // production. `NODE_ENV` is statically replaced at build time, so the button
  // (and its handler) tree-shake out of the prod bundle.
  const showTestPhotoButton = process.env.NODE_ENV !== 'production';

  const remaining = maxPhotos - shots.length;
  const atCap = remaining <= 0;
  const lastSlide = gallerySlides[gallerySlides.length - 1];
  const cameraLive = !startError && !cameraError;

  const cameraUi = (
    <motion.div
      initial={framerPresenceMobile.camera.initial}
      animate={framerPresenceMobile.camera.animate}
      exit={framerPresenceMobile.camera.exit}
      transition={framerTransitionMobile.cameraEnter}
      className={`${embedded ? 'absolute' : 'fixed'} inset-0 z-modal overflow-hidden bg-stage select-none`}
    >
      {/* ── Full-bleed viewfinder ── */}
      <div ref={viewfinderRef} className="absolute inset-0">
        {cameraLive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-glass/10 flex items-center justify-center mb-4">
              <Camera className="h-8 w-8 text-white/50" />
            </div>
            <p className="text-sm font-semibold text-white mb-1">Camera unavailable</p>
            <p className="text-xs text-white/50 mb-4 max-w-xs">
              {cameraError === 'permission-denied'
                ? 'Enable camera access in your browser settings, then tap Try Again.'
                : 'No camera detected, or the browser blocked access.'}
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={attemptStart}
              className="h-11 px-5 rounded-none text-role-caption font-semibold uppercase tracking-wider"
            >
              Try Again
            </Button>

            {showTestPhotoButton && (
              <Button
                type="button"
                variant="primary"
                onClick={handleUseTestPhoto}
                className="mt-3 h-11 px-5 rounded-none bg-amber-500 text-black text-role-caption font-semibold uppercase tracking-wider hover:bg-amber-600 active:bg-amber-600"
              >
                Use Test Photo · Dev
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Black shutter snap ── */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute inset-0 z-20 bg-stage pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* ── Top scrim: header (left) + close (right) ── */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-start justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
          <div className="flex-1 min-w-0">
            {header ?? (
              <>
                <p className="text-role-micro uppercase tracking-[0.22em] text-white/60">
                  Add photos
                </p>
                <p className="text-sm font-semibold text-white">
                  {shots.length}/{maxPhotos}
                </p>
              </>
            )}
          </div>
          <IconButton
            type="button"
            onClick={handleCancel}
            ariaLabel="Close camera"
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-full bg-scrim/40 backdrop-blur-sm active:bg-scrim/60 transition-colors"
            icon={<X className="h-5 w-5 text-white" />}
          />
        </div>
      </div>

      {/* ── Cap reached banner ── */}
      {atCap && cameraLive && (
        <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-1/2 z-10 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-500/95 text-xs font-semibold uppercase tracking-wider text-white shadow-lg">
          Max {maxPhotos} photos
        </div>
      )}

      {/* ── Quality-gate coaching (plan §2c) ── */}
      {gateHint && cameraLive && !atCap && (
        <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-1/2 z-10 w-[min(92vw,22rem)] -translate-x-1/2 rounded-none bg-amber-500/95 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg">
          {gateHint}
        </div>
      )}

      {/* ── Floating controls: gallery · shutter · done hovering over the
          viewfinder (no bar). The wrapper itself ignores pointer events so the
          gaps between controls stay tappable as live viewfinder. ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none">
        <div className="grid grid-cols-3 items-center px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] [&_button]:pointer-events-auto">
          {/* Gallery — small circular last-shot bubble. Filled with the photo
              (no white ring) and smaller than the shutter, so it reads as a
              thumbnail rather than a second shutter. Hidden until the first shot. */}
          <div className="flex justify-start">
            {/* ds-raw-button: image/photo thumbnail tile (last-shot gallery bubble) */}
            <button
              type="button"
              onClick={openGallery}
              disabled={gallerySlides.length === 0}
              aria-label="View photos"
              className="relative h-12 w-12 rounded-full overflow-hidden ring-2 ring-glass/40 bg-scrim/40 shadow-lg active:scale-95 transition-transform disabled:opacity-0 disabled:pointer-events-none"
            >
              {lastSlide && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lastSlide.previewUrl}
                  alt="Latest photo"
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          </div>

          {/* Shutter */}
          <div className="flex justify-center">
            {/* ds-raw-button: camera shutter (bespoke ring-over-fill control) */}
            <button
              type="button"
              onClick={shutter}
              disabled={atCap || !cameraLive}
              aria-label="Capture photo"
              className="h-[72px] w-[72px] rounded-full border-4 border-white bg-transparent active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center"
            >
              <span className="block h-14 w-14 rounded-full bg-stage-contrast active:bg-stage-contrast/80 transition-colors" />
            </button>
          </div>

          {/* Done — checkmark only */}
          <div className="flex justify-end">
            <IconButton
              type="button"
              onClick={handleDone}
              disabled={shots.length === 0}
              ariaLabel="Done"
              className="h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg active:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 disabled:active:bg-emerald-500"
              icon={<Check className="h-7 w-7 text-white" />}
            />
          </div>
        </div>
      </div>

      <MobileSwipePhotoViewer
        open={previewIndex !== null}
        initialIndex={previewIndex ?? 0}
        slides={swipeSlides}
        onClose={() => setPreviewIndex(null)}
        onDelete={handleViewerDelete}
      />
    </motion.div>
  );

  if (embedded) {
    return (
      <div className="relative h-full min-h-[100dvh] w-full overflow-hidden">
        {cameraUi}
      </div>
    );
  }
  return mounted ? createPortal(cameraUi, document.body) : null;
}
