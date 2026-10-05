'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { Camera, Check, Images, X } from '@/components/Icons';
import { Button, IconButton, Layer } from '@/design-system/primitives';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { captureTimeFromFile, shutterCaptureTime } from '@/lib/photos/capture-time';
import {
  canUseContinuousWebCamera,
  captureFileName,
  type CapturedShot,
  type PhotoCaptureSource,
} from '@/lib/photos/capture-session';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  gateStillFrame,
  PACK_SLIP_GATE_COACHING,
} from '@/lib/vision/frame-quality';
import { toast } from '@/lib/toast';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { MobileContinuousPhotoCamera } from './MobileContinuousPhotoCamera';

export type { CapturedShot } from '@/lib/photos/capture-session';

export interface PriorPhoto {
  id: string;
  /** Grid tile source — a thumbnail is right here. */
  previewUrl: string;
  /** What the full-screen viewer paints; without it the viewer would show the tile thumbnail stretched. */
  fullUrl?: string;
  photoId?: number;
}

/**
 * Operating-system camera fallback. `capture` asks iOS/Android for the rear
 * camera but usually returns one file per invocation. Continuous multi-shot
 * work belongs to `MobileContinuousPhotoCamera`; library batching uses a
 * separate input without `capture`.
 */
export const MobileNativePhotoInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'accept' | 'capture'>
>(function MobileNativePhotoInput({ className = 'sr-only', ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      type="file"
      accept="image/*"
      capture="environment"
      className={className}
    />
  );
});

/**
 * Photo-library batch picker: several existing photos in one pick, no
 * `capture`. A host may click it from its own button (inside the user's tap —
 * iOS opens the picker only from a gesture) and hand the files to
 * {@link MobileNativePhotoCapture} `initialFiles` for review.
 */
export const MobilePhotoLibraryInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'accept' | 'capture' | 'multiple'>
>(function MobilePhotoLibraryInput({ className = 'sr-only', ...props }, ref) {
  return <input {...props} ref={ref} type="file" accept="image/*" multiple className={className} />;
});

interface MobileNativePhotoCaptureProps {
  onDone: (shots: CapturedShot[]) => void;
  onCancel: () => void;
  maxPhotos?: number;
  jpegQuality?: number;
  header?: React.ReactNode;
  priorPhotos?: PriorPhoto[];
  onDeletePrior?: (photoId: number) => void | Promise<void>;
  embedded?: boolean;
  gateCapture?: boolean;
  /**
   * Library files the host already picked (its own Choose photos, clicked in
   * the user's gesture). They land as new shots for review and the live
   * camera stays closed until asked for.
   */
  initialFiles?: readonly File[];
}

type GallerySlide =
  | { kind: 'prior'; id: string; previewUrl: string; fullUrl: string; photoId?: number }
  | { kind: 'capture'; id: string; previewUrl: string; fullUrl: string };

const GATE_DIMENSION = 160;

async function qualityGatePhoto(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const width = GATE_DIMENSION;
    const height = Math.max(1, Math.round((width * image.naturalHeight) / image.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return true;
    context.drawImage(image, 0, 0, width, height);
    return gateStillFrame(context.getImageData(0, 0, width, height)).ok;
  } catch {
    // A device-native format the browser cannot decode should still be handed
    // to the uploader, which owns its normal format fallback/error handling.
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shared mobile photo-taking surface. The OS owns camera focus, exposure,
 * image processing, permissions and capture lifecycle; this component owns
 * batching, previews and handoff to the existing upload contracts.
 */
export function MobileNativePhotoCapture({
  onDone,
  onCancel,
  maxPhotos = 5,
  jpegQuality = 0.85,
  header,
  priorPhotos = [],
  onDeletePrior,
  embedded = false,
  gateCapture = false,
  initialFiles,
}: MobileNativePhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<CapturedShot[]>([]);
  const handedOffRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [continuousCameraOpen, setContinuousCameraOpen] = useState(false);
  const [continuousCameraAvailable, setContinuousCameraAvailable] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  shotsRef.current = shots;

  useEffect(
    () => () => {
      if (handedOffRef.current) return;
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.previewUrl));
    },
    [],
  );

  // Read once: a host's picked files open review, not the camera.
  const initialFilesRef = useRef(initialFiles);
  useEffect(() => {
    const available = canUseContinuousWebCamera();
    setContinuousCameraAvailable(available);
    setContinuousCameraOpen(available && !initialFilesRef.current?.length);
  }, []);

  const gallerySlides = useMemo<GallerySlide[]>(
    () => [
      ...priorPhotos.map((photo) => ({
        kind: 'prior' as const,
        id: photo.id,
        previewUrl: photo.previewUrl,
        fullUrl: photo.fullUrl ?? photo.previewUrl,
        photoId: photo.photoId,
      })),
      ...shots.map((shot) => ({
        kind: 'capture' as const,
        id: shot.id,
        // A capture's blob URL is already the full shot.
        previewUrl: shot.previewUrl,
        fullUrl: shot.previewUrl,
      })),
    ],
    [priorPhotos, shots],
  );

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      gallerySlides.map((slide) => ({
        id: slide.id,
        // Full screen is full resolution: never the grid thumbnail.
        previewUrl: slide.fullUrl,
        deletable:
          slide.kind === 'capture' ||
          (slide.photoId != null && typeof onDeletePrior === 'function'),
      })),
    [gallerySlides, onDeletePrior],
  );

  useEffect(() => {
    setPreviewIndex((index) => {
      if (index == null) return null;
      if (gallerySlides.length === 0) return null;
      return Math.min(index, gallerySlides.length - 1);
    });
  }, [gallerySlides.length]);

  const openCamera = useCallback(() => {
    if (processing || shots.length >= maxPhotos) return;
    inputRef.current?.click();
  }, [maxPhotos, processing, shots.length]);

  const addFiles = useCallback(
    async (files: readonly File[], source: PhotoCaptureSource) => {
      const selected = Array.from(files).slice(0, Math.max(0, maxPhotos - shotsRef.current.length));
      if (selected.length === 0) return;
      setProcessing(true);
      let rejected = 0;
      const accepted: CapturedShot[] = [];
      try {
        for (const file of selected) {
          const compressed = await compressPhotoForUpload(file, {
            quality: jpegQuality,
            source: `mobile-${source}`,
          });
          if (gateCapture && !(await qualityGatePhoto(compressed.blob))) {
            rejected += 1;
            continue;
          }
          accepted.push({
            id: safeRandomUUID(),
            blob: compressed.blob,
            previewUrl: URL.createObjectURL(compressed.blob),
            capturedAtMs: captureTimeFromFile(file) ?? shutterCaptureTime(),
            source,
          });
        }
        if (accepted.length > 0) setShots((current) => [...current, ...accepted]);
        if (rejected > 0) {
          toast.message(PACK_SLIP_GATE_COACHING, {
            description: `${rejected} photo${rejected === 1 ? ' was' : 's were'} not added.`,
            position: 'top-center',
            duration: 3500,
          });
        }
      } catch (error) {
        accepted.forEach((shot) => URL.revokeObjectURL(shot.previewUrl));
        toast.error(error instanceof Error ? error.message : 'Could not prepare the photo.', {
          position: 'top-center',
        });
      } finally {
        setProcessing(false);
      }
    },
    [gateCapture, jpegQuality, maxPhotos],
  );

  const initialFilesAdded = useRef(false);
  useEffect(() => {
    const files = initialFilesRef.current;
    if (initialFilesAdded.current || !files?.length) return;
    initialFilesAdded.current = true;
    void addFiles(files, 'photo-library');
  }, [addFiles]);

  const addContinuousFrame = useCallback(
    async (blob: Blob) => {
      const capturedAtMs = shutterCaptureTime();
      const file = new File([blob], captureFileName(capturedAtMs), {
        type: blob.type || 'image/jpeg',
        lastModified: capturedAtMs,
      });
      await addFiles([file], 'web-camera');
    },
    [addFiles],
  );

  const continuousCameraUnavailable = useCallback((message: string) => {
    setCameraMessage(message);
    setContinuousCameraOpen(false);
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((current) => {
      const target = current.find((shot) => shot.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((shot) => shot.id !== id);
    });
  }, []);

  const handleViewerDelete = useCallback(
    (slide: SwipePhotoSlide) => {
      const match = gallerySlides.find((candidate) => candidate.id === slide.id);
      if (!match) return;
      if (match.kind === 'capture') {
        removeShot(match.id);
      } else if (match.photoId != null && onDeletePrior) {
        void onDeletePrior(match.photoId);
      }
    },
    [gallerySlides, onDeletePrior, removeShot],
  );

  const handleDone = useCallback(() => {
    handedOffRef.current = true;
    onDone(shots);
  }, [onDone, shots]);

  const handleClose = useCallback(() => {
    if (shots.length > 0) {
      handedOffRef.current = true;
      onDone(shots);
    } else {
      onCancel();
    }
  }, [onCancel, onDone, shots]);

  const atCap = shots.length >= maxPhotos;
  const count = shots.length;
  const captureUi = (
    <Layer
      level="modal"
      portal={!embedded}
      role="dialog"
      aria-modal="true"
      aria-label="Add photos"
      className={`${embedded ? 'absolute' : 'fixed'} inset-0 z-modal flex min-h-[100dvh] flex-col overflow-hidden bg-stage text-white`}
      data-testid="mobile-native-photo-capture"
    >
      <MobileNativePhotoInput
        ref={inputRef}
        multiple={maxPhotos - shots.length > 1}
        disabled={processing || atCap}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []), 'native-camera');
          event.target.value = '';
        }}
        data-testid="mobile-native-photo-input"
      />
      <MobilePhotoLibraryInput
        ref={libraryInputRef}
        disabled={processing || atCap}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []), 'photo-library');
          event.target.value = '';
        }}
        data-testid="mobile-photo-library-input"
      />

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          {header ?? (
            <>
              <p className="text-role-micro text-white/60">Add photos</p>
              <p className="text-sm font-semibold text-white">Capture one photo or a full set</p>
            </>
          )}
        </div>
        <IconButton
          type="button"
          onClick={handleClose}
          ariaLabel="Close photo capture"
          size="touch"
          radius="pill"
          tone="glass"
          className="shrink-0 bg-white/10 active:bg-white/20"
          icon={<X className="h-5 w-5 text-white" />}
        />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              radius="surface"
              icon={<Camera className="h-5 w-5" />}
              onClick={openCamera}
              disabled={processing || atCap}
              className="min-h-12 justify-center !bg-white !text-black ring-1 ring-white"
              data-testid="mobile-native-camera-open"
            >
              Device camera
            </Button>
            <Button
              type="button"
              variant="glass"
              size="lg"
              radius="surface"
              icon={<Images className="h-5 w-5" />}
              onClick={() => libraryInputRef.current?.click()}
              disabled={processing || atCap}
              className="min-h-12 justify-center bg-white/10 text-white ring-1 ring-white/40"
              data-testid="mobile-photo-library-open"
            >
              Choose photos
            </Button>
          </div>

          {cameraMessage ? (
            <p role="status" className="rounded-surface border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-role-caption text-amber-100">
              {cameraMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between text-role-caption text-white/60">
            <span>{continuousCameraAvailable ? 'Continuous, device or library' : 'Device camera or library'}</span>
            <span className="font-mono">{count}/{maxPhotos} new</span>
          </div>

          {gallerySlides.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2" aria-label="Photos">
              {gallerySlides.map((slide, index) => (
                <li key={slide.id}>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="relative aspect-square w-full overflow-hidden rounded-mode border border-white/15 bg-white/5 active:opacity-80"
                    aria-label={`View photo ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.previewUrl} alt="" className="h-full w-full object-cover" />
                    {slide.kind === 'capture' ? (
                      <span className="absolute bottom-1 right-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        NEW
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center border border-dashed border-white/15 px-6 text-center">
              <Camera className="mb-3 h-8 w-8 text-white/35" />
              <p className="text-sm font-semibold text-white/80">No photos yet</p>
              <p className="mt-1 text-role-caption text-white/45">
                Capture repeatedly or choose several existing photos.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="pointer-events-none flex shrink-0 justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={handleDone}
          disabled={processing || shots.length === 0}
          aria-label="Done"
          className="pointer-events-auto grid h-14 w-14 place-items-center text-emerald-400 disabled:opacity-35 active:scale-95"
          data-testid="mobile-photo-fallback-done"
        >
          <Check className="h-8 w-8" />
        </button>
      </footer>

      <MobileSwipePhotoViewer
        open={previewIndex != null}
        initialIndex={previewIndex ?? 0}
        slides={swipeSlides}
        onClose={() => setPreviewIndex(null)}
        onDelete={handleViewerDelete}
      />

      {continuousCameraOpen ? (
        <MobileContinuousPhotoCamera
          count={count}
          maxPhotos={maxPhotos}
          processing={processing}
          onCapture={addContinuousFrame}
          onClose={handleClose}
          onDone={handleDone}
          onOpenLibrary={() => libraryInputRef.current?.click()}
          onUnavailable={continuousCameraUnavailable}
        />
      ) : null}
    </Layer>
  );

  if (embedded) {
    return <div className="relative min-h-[100dvh] w-full overflow-hidden">{captureUi}</div>;
  }
  return captureUi;
}
