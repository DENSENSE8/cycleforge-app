'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Images, Loader2, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';
import {
  captureFrameDimensions,
  CONTINUOUS_CAMERA_CONSTRAINTS,
} from '@/lib/photos/capture-session';
import { warmCamera } from '@/lib/scan/warm-camera';

interface MobileContinuousPhotoCameraProps {
  /** Photos taken this session — the top-left count. */
  count: number;
  /** Optional host cap; omitted = no cap (packing). The count never shows a denominator. */
  maxPhotos?: number;
  processing: boolean;
  onCapture: (blob: Blob) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
  /** Bottom-left gallery button. Omit with `bottomLeft` for a camera-only host. */
  onOpenLibrary?: () => void;
  onUnavailable: (message: string) => void;
  /** Replaces the gallery button in the bottom-left thumb position (packer: last-shot review). */
  bottomLeft?: ReactNode;
  /** Host copy painted top-left under the shot count. */
  overlay?: ReactNode;
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was blocked. Use Device camera instead.';
    if (error.name === 'NotFoundError') return 'No camera was found. Use photos from this device instead.';
    if (error.name === 'NotReadableError') return 'The camera is in use by another app.';
  }
  return 'The continuous camera could not start. Use Device camera instead.';
}

/**
 * Browser-owned continuous capture. The MediaStream remains mounted after a
 * shutter press, so an operator can take a full evidence set without leaving
 * the viewfinder between photos.
 */
export function MobileContinuousPhotoCamera({
  count,
  maxPhotos,
  processing,
  onCapture,
  onClose,
  onDone,
  onOpenLibrary,
  onUnavailable,
  bottomLeft,
  overlay,
}: MobileContinuousPhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterBusyRef = useRef(false);
  const choosingLibraryRef = useRef(false);
  const haptic = usePressHaptic();
  const [starting, setStarting] = useState(true);
  const atCap = maxPhotos != null && count >= maxPhotos;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let alive = true;
    // One lens at a time: a scan stream parked by the capture window gives way
    // (iOS would mute it anyway; Android would open the camera twice).
    warmCamera.release();
    void navigator.mediaDevices
      .getUserMedia(CONTINUOUS_CAMERA_CONSTRAINTS)
      .then(async (stream) => {
        if (!alive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStarting(false);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setStarting(false);
        onUnavailable(cameraErrorMessage(error));
      });

    const onVisibilityChange = () => {
      if (choosingLibraryRef.current) return;
      if (document.visibilityState === 'hidden') {
        stopCamera();
        onUnavailable('Camera paused when the app moved to the background.');
      }
    };
    const onWindowFocus = () => {
      choosingLibraryRef.current = false;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      stopCamera();
    };
  }, [onUnavailable, stopCamera]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || starting || processing || atCap || shutterBusyRef.current) return;
    shutterBusyRef.current = true;
    haptic();
    try {
      const { width, height } = captureFrameDimensions(video.videoWidth, video.videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        onUnavailable('This browser could not read the camera frame. Use Device camera instead.');
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) {
        onUnavailable('This browser could not prepare the photo. Use Device camera instead.');
        return;
      }
      await onCapture(blob);
    } finally {
      shutterBusyRef.current = false;
    }
  }, [atCap, haptic, onCapture, onUnavailable, processing, starting]);

  const openLibrary = useCallback(() => {
    if (!onOpenLibrary) return;
    choosingLibraryRef.current = true;
    onOpenLibrary();
  }, [onOpenLibrary]);

  return (
    <div
      className="absolute inset-0 z-panelOverlay min-h-[100dvh] overflow-hidden bg-black text-white"
      data-testid="mobile-continuous-photo-camera"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label="Camera preview"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-panelOverlay">
        <IconButton
          type="button"
          onClick={onClose}
          ariaLabel="Close photo capture"
          size="touch"
          radius="pill"
          tone="glass"
          className="bg-black/55 backdrop-blur-md active:bg-black/75"
          icon={<X className="h-5 w-5 text-white" />}
        />
      </div>

      {/* Top row: count left, ✕ right. The host's copy (packer: title + order id) sits under the count. */}
      <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-panelOverlay flex flex-col items-start gap-2">
        <div className="rounded-full bg-black/55 px-3 py-2 font-mono text-xs font-semibold backdrop-blur-md">
          {count}
        </div>
        {overlay}
      </div>

      {starting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="flex items-center gap-2 text-sm text-white/75">
            <Loader2 className="h-5 w-5 animate-spin" /> Starting camera…
          </div>
        </div>
      ) : null}
      {atCap ? (
        <div className="absolute inset-x-4 bottom-28 rounded-surface bg-black/70 px-4 py-3 text-center text-sm font-semibold backdrop-blur-md">
          Maximum {maxPhotos} photos. Tap the checkmark to continue.
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-[1fr_auto_1fr] items-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {bottomLeft ?? (onOpenLibrary ? (
          <button
            type="button"
            onClick={openLibrary}
            disabled={processing || atCap}
            aria-label="Choose more photos"
            className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md disabled:opacity-40 active:scale-95"
            data-testid="mobile-continuous-camera-gallery"
          >
            <Images className="h-6 w-6" />
          </button>
        ) : <span aria-hidden />)}
        <button
          type="button"
          onClick={() => void capture()}
          disabled={starting || processing || atCap}
          aria-label="Take photo"
          className="pointer-events-auto grid h-20 w-20 place-items-center rounded-full border-[3px] border-white/95 disabled:opacity-40 active:scale-95"
          data-testid="mobile-continuous-camera-shutter"
        >
          {processing ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : (
            <span className="h-16 w-16 rounded-full bg-white" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={processing || count === 0}
          aria-label="Done"
          className="pointer-events-auto ml-auto grid h-14 w-14 place-items-center text-emerald-400 disabled:opacity-35 active:scale-95"
          data-testid="mobile-continuous-camera-done"
        >
          <Check className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}
