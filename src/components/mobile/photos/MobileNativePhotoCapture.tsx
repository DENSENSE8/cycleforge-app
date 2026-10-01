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
import { Camera, Check, Loader2, X } from '@/components/Icons';
import { Button, IconButton, Layer } from '@/design-system/primitives';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { shutterCaptureTime } from '@/lib/photos/capture-time';
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

export interface CapturedShot {
  id: string;
  blob: Blob;
  previewUrl: string;
  capturedAtMs: number;
}

export interface PriorPhoto {
  id: string;
  previewUrl: string;
  photoId?: number;
}

/**
 * The only photo-taking input mobile surfaces should render. `capture` is a
 * hint to iOS/Android to hand the user to the operating system's rear-camera
 * experience. It deliberately does not use getUserMedia or paint a web
 * viewfinder. Barcode/QR scanners are separate continuous-video tools.
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
}

type GallerySlide =
  | { kind: 'prior'; id: string; previewUrl: string; photoId?: number }
  | { kind: 'capture'; id: string; previewUrl: string };

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
}: MobileNativePhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<CapturedShot[]>([]);
  const handedOffRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  shotsRef.current = shots;

  useEffect(
    () => () => {
      if (handedOffRef.current) return;
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.previewUrl));
    },
    [],
  );

  const gallerySlides = useMemo<GallerySlide[]>(
    () => [
      ...priorPhotos.map((photo) => ({
        kind: 'prior' as const,
        id: photo.id,
        previewUrl: photo.previewUrl,
        photoId: photo.photoId,
      })),
      ...shots.map((shot) => ({
        kind: 'capture' as const,
        id: shot.id,
        previewUrl: shot.previewUrl,
      })),
    ],
    [priorPhotos, shots],
  );

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      gallerySlides.map((slide) => ({
        id: slide.id,
        previewUrl: slide.previewUrl,
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
    async (files: FileList | null) => {
      const selected = Array.from(files ?? []).slice(0, Math.max(0, maxPhotos - shotsRef.current.length));
      if (selected.length === 0) return;
      setProcessing(true);
      let rejected = 0;
      const accepted: CapturedShot[] = [];
      try {
        for (const file of selected) {
          const compressed = await compressPhotoForUpload(file, {
            quality: jpegQuality,
            source: 'mobile-native-camera',
          });
          if (gateCapture && !(await qualityGatePhoto(compressed.blob))) {
            rejected += 1;
            continue;
          }
          accepted.push({
            id: safeRandomUUID(),
            blob: compressed.blob,
            previewUrl: URL.createObjectURL(compressed.blob),
            capturedAtMs: shutterCaptureTime(),
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
          void addFiles(event.target.files);
          event.target.value = '';
        }}
        data-testid="mobile-native-photo-input"
      />

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          {header ?? (
            <>
              <p className="text-role-micro text-white/60">Add photos</p>
              <p className="text-sm font-semibold text-white">Use your device camera</p>
            </>
          )}
        </div>
        <IconButton
          type="button"
          onClick={handleClose}
          ariaLabel="Close photo capture"
          className="h-11 w-11 shrink-0 rounded-full bg-white/10 active:bg-white/20"
          icon={<X className="h-5 w-5 text-white" />}
        />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <Button
            type="button"
            variant="primary"
            size="lg"
            radius="surface"
            icon={processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            onClick={openCamera}
            disabled={processing || atCap}
            className="min-h-16 w-full justify-center text-base font-semibold"
            data-testid="mobile-native-camera-open"
          >
            {processing
              ? 'Preparing photo…'
              : atCap
                ? `Maximum ${maxPhotos} photos`
                : count > 0
                  ? 'Take another photo'
                  : 'Open camera'}
          </Button>

          <div className="flex items-center justify-between text-role-caption text-white/60">
            <span>Device camera</span>
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
                Your phone controls focus, exposure and image processing.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-stage px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          radius="surface"
          icon={<Check className="h-5 w-5" />}
          onClick={handleDone}
          disabled={processing || shots.length === 0}
          className="mx-auto w-full max-w-md justify-center"
        >
          Done{shots.length > 0 ? ` · ${shots.length}` : ''}
        </Button>
      </footer>

      <MobileSwipePhotoViewer
        open={previewIndex != null}
        initialIndex={previewIndex ?? 0}
        slides={swipeSlides}
        onClose={() => setPreviewIndex(null)}
        onDelete={handleViewerDelete}
      />
    </Layer>
  );

  if (embedded) {
    return <div className="relative min-h-[100dvh] w-full overflow-hidden">{captureUi}</div>;
  }
  return captureUi;
}
