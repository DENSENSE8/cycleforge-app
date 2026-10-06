'use client';

import type { IScannerControls } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cameraStreamIsLive,
  loadBarcodeReader,
  stopCameraStream,
  warmCamera,
} from '@/lib/scan/warm-camera';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BarcodeScanStatus = 'idle' | 'scanning' | 'paused' | 'error';

export interface UseBarcodeScanner {
  /** Attach to a <video autoPlay playsInline muted /> — ZXing renders its camera feed here. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Last decoded barcode string (null until first decode). */
  lastScannedValue: string | null;
  /** Current scan lifecycle phase. */
  scanStatus: BarcodeScanStatus;
  /** Start the camera and begin continuous scanning. */
  startScanning: () => Promise<void>;
  /** Stop the camera entirely (also releases a stream this scanner parked). */
  stopScanning: () => Promise<void>;
  /**
   * Detach the camera and stop decoding. With `keepWarm` (under the `/m` shell)
   * the stream parks for the next capture window to reattach; otherwise this
   * stops it like {@link stopScanning}.
   */
  parkScanning: () => void;
  /** Pause decoding (camera stays on but no callbacks fire). */
  pauseScanning: () => void;
  /** Resume decoding after pause. */
  resumeScanning: () => void;
  /** Signal that the caller accepted the last scan — cooldown prevents re-fire. */
  acceptScan: () => void;
  /** Clear lastScannedValue back to null. `keepDedup` leaves the decode window armed. */
  resetLastScan: (opts?: { keepDedup?: boolean }) => void;
  /** True while camera is actively scanning (not paused or stopped). */
  isScanning: boolean;
  /** Error message if camera fails to start. */
  error: string | null;
  /** Toggle torch/flashlight if available. */
  toggleTorch: () => void;
  /** Whether torch is currently on. */
  torchOn: boolean;
}

interface UseBarcodeOptions {
  /** Dedup window in ms — same value within this window is suppressed. Default: 2000. */
  dedupMs?: number;
  /** Cooldown after acceptScan() in ms. Default: 1500. */
  acceptCooldownMs?: number;
  /**
   * Park the stream on unmount / `parkScanning` instead of stopping it, so the
   * next capture window reattaches without a fresh `getUserMedia`. Only while
   * `useWarmCameraOwner` is mounted (the `/m` shell); elsewhere a park stops.
   */
  keepWarm?: boolean;
}

/**
 * The rear camera at high resolution with CONTINUOUS autofocus — small
 * DataMatrix labels (prepacked SKU+serial) won't decode on a fixed-focus frame.
 */
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    // focusMode isn't in the TS MediaTrackConstraints type yet.
    advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
  },
};

// ─── Hook ───────────────────────────────────────────────────────────────────

/** Universal barcode scanner hook powered by `@zxing/browser`. */
export function useBarcodeScanner(options: UseBarcodeOptions = {}): UseBarcodeScanner {
  const { dedupMs = 2000, acceptCooldownMs = 1500, keepWarm = false } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  /** The stream on this scanner's video element. */
  const streamRef = useRef<MediaStream | null>(null);
  /** The stream this scanner last parked — its stop releases that one, never another window's. */
  const parkedRef = useRef<MediaStream | null>(null);
  /** Bumped by every start/stop/park; a start that finds it moved is stale. */
  const sessionRef = useRef(0);
  /** What a stale start does with a stream it acquired late: whatever the call that superseded it asked for. */
  const handoffRef = useRef<'park' | 'stop'>('stop');
  const keepWarmRef = useRef(keepWarm);
  keepWarmRef.current = keepWarm;
  const pausedRef = useRef(false);
  const torchOnRef = useRef(false);

  // A parked lens is about to be reattached: open as scanning so the panel
  // does not flash its warm-up between the route change and the attach.
  const [scanStatus, setScanStatus] = useState<BarcodeScanStatus>(() =>
    keepWarm && warmCamera.holding() ? 'scanning' : 'idle',
  );
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  // Dedup + cooldown refs
  const lastDecodedRef = useRef<{ value: string; timestamp: number } | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  const log = useCallback((msg: string) => {
    if (typeof window !== 'undefined' && !(window as any).__USAV_CAMERA_DEBUG) return;
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // eslint-disable-next-line no-console -- opt-in client camera-debug trace (gated by window.__USAV_CAMERA_DEBUG)
    console.debug(`[useBarcodeScanner ${ts}] ${msg}`);
  }, []);

  const setTorch = useCallback((on: boolean) => {
    torchOnRef.current = on;
    setTorchOn(on);
  }, []);

  /**
   * Stop decoding and take the stream off the video element; the caller parks
   * or stops what comes back. `handoff` is what an in-flight start that this
   * supersedes does with a stream it acquires late.
   */
  const detach = useCallback((handoff: 'park' | 'stop'): MediaStream | null => {
    sessionRef.current += 1;
    handoffRef.current = handoff;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    pausedRef.current = false;
    return stream;
  }, []);

  // ── Start scanning ──

  const startScanning = useCallback(async () => {
    log('startScanning called');

    const isSecureOrigin =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus('error');
      setError(
        isSecureOrigin
          ? 'Camera API unavailable in this browser.'
          : 'Camera access requires HTTPS or localhost.',
      );
      return;
    }

    const video = videoRef.current;
    if (!video) {
      log('ERROR: no video ref');
      return;
    }

    // A restart keeps the stream already on the element; a window coming back
    // to the screen reattaches the parked one. Either shows frames at once —
    // before the decoder is even awaited.
    const held = detach('stop');
    const session = sessionRef.current;
    const isStale = () => session !== sessionRef.current;
    let reused = held && cameraStreamIsLive(held) ? held : null;
    if (held && !reused) stopCameraStream(held);
    if (!reused && keepWarmRef.current) reused = warmCamera.take();
    parkedRef.current = null;
    if (reused) {
      streamRef.current = reused;
      video.srcObject = reused;
      setScanStatus('scanning');
      setError(null);
    }

    try {
      const reader = await loadBarcodeReader();
      if (isStale()) return;
      log('ZXing reader ready');

      setScanStatus('scanning');
      setError(null);
      pausedRef.current = false;

      let fresh: MediaStream | null = null;
      if (!streamRef.current) {
        fresh = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (isStale()) {
          // Superseded while the lens opened: hand it to whatever superseded us.
          if (keepWarmRef.current && handoffRef.current === 'park') {
            warmCamera.park(fresh);
            parkedRef.current = fresh;
          } else {
            stopCameraStream(fresh);
          }
          return;
        }
        streamRef.current = fresh;
        video.srcObject = fresh;
      }

      // Decodes the element's own stream — the controls stop the loop, never
      // the stream, so a park keeps the lens.
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (pausedRef.current) return;
        if (!result) return; // no barcode in this frame

        const decodedText = result.getText();
        const now = Date.now();

        // Cooldown check
        if (now < cooldownUntilRef.current) return;

        // Dedup check
        const last = lastDecodedRef.current;
        if (last && last.value === decodedText && now - last.timestamp < dedupMs) return;

        log(`Decoded: ${decodedText}`);
        lastDecodedRef.current = { value: decodedText, timestamp: now };
        setLastScannedValue(decodedText);
      });
      if (isStale()) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      log(reused ? 'Scanning resumed on the warm lens' : 'Scanning started');

      // Force continuous autofocus on a newly opened track (the lens keeps
      // hunting to sharpen on whatever's in frame, including a small label
      // held close). A reattached lens already has it.
      if (fresh) {
        try {
          const track = fresh.getVideoTracks()[0];
          const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
          const focusModes = (caps.focusMode as string[] | undefined) ?? [];
          if (track && focusModes.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            });
          }
        } catch {
          /* focus control unsupported — fall back to the camera's default */
        }
      }
    } catch (err) {
      if (isStale()) return;
      const failed = detach('stop');
      if (failed) stopCameraStream(failed);
      setScanStatus('error');

      // getUserMedia rejects with a DOMException; ZXing's play timeout rejects with `false`.
      const failure = (err ?? {}) as { name?: unknown; message?: unknown };
      const errName = String(failure.name ?? '');
      const message = String(failure.message ?? '');
      const errMsg = message.toLowerCase();
      log(`ERROR: name=${errName} msg=${message.slice(0, 120)}`);

      if (!isSecureOrigin || errMsg.includes('secure context') || errMsg.includes('https')) {
        setError('Camera access requires HTTPS or localhost. Safari will not prompt on an insecure dev URL.');
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errMsg.includes('permission')) {
        setError('Camera permission denied. On Safari: Settings → Safari → Camera → Allow. Then reload.');
      } else if (errName === 'NotReadableError' || errMsg.includes('could not start video')) {
        setError('Camera is busy or blocked by another app or browser tab.');
      } else if (errName === 'NotFoundError' || errMsg.includes('no camera') || errMsg.includes('not found')) {
        setError('No camera found on this device.');
      } else {
        setError(message || 'Camera unavailable');
      }
    }
  }, [log, dedupMs, detach]);

  // ── Stop / park ──

  const stopScanning = useCallback(async () => {
    const stream = detach('stop');
    if (stream) stopCameraStream(stream);
    if (parkedRef.current) warmCamera.release(parkedRef.current);
    parkedRef.current = null;
    setTorch(false);
    setScanStatus('idle');
  }, [detach, setTorch]);

  const parkScanning = useCallback(() => {
    const stream = detach('park');
    setScanStatus('idle');
    if (!stream) return;
    // A lit torch never parks: the flashlight would burn on behind another screen.
    if (keepWarmRef.current && !torchOnRef.current) {
      warmCamera.park(stream);
      parkedRef.current = stream;
      return;
    }
    stopCameraStream(stream);
    setTorch(false);
  }, [detach, setTorch]);

  // ── Pause / Resume ──

  const pauseScanning = useCallback(() => {
    pausedRef.current = true;
    setScanStatus('paused');
  }, []);

  const resumeScanning = useCallback(() => {
    pausedRef.current = false;
    setScanStatus('scanning');
  }, []);

  // ── Accept / Reset ──

  const acceptScan = useCallback(() => {
    cooldownUntilRef.current = Date.now() + acceptCooldownMs;
  }, [acceptCooldownMs]);

  const resetLastScan = useCallback((opts?: { keepDedup?: boolean }) => {
    setLastScannedValue(null);
    if (!opts?.keepDedup) {
      lastDecodedRef.current = null;
    }
  }, []);

  // ── Torch ──

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    if (!track || !caps?.torch) return;
    const next = !torchOnRef.current;
    track
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorch(next))
      .catch(() => {});
  }, [setTorch]);

  // ── Unmount: park (keepWarm) or stop ──

  useEffect(() => parkScanning, [parkScanning]);

  return {
    videoRef,
    lastScannedValue,
    scanStatus,
    startScanning,
    stopScanning,
    parkScanning,
    pauseScanning,
    resumeScanning,
    acceptScan,
    resetLastScan,
    isScanning: scanStatus === 'scanning',
    error,
    toggleTorch,
    torchOn,
  };
}

/**
 * Owns the warm lens for a shell (the `/m` layout). While mounted, a
 * `keepWarm` scanner may park its stream between screens; the page going
 * hidden releases the parked stream, and leaving the shell releases it. Also
 * pre-loads the decoder chunk on idle so the first Scan does not wait on it —
 * a module load, never a camera permission ask.
 */
export function useWarmCameraOwner(): void {
  useEffect(() => {
    warmCamera.setOwned(true);
    const onVisibility = () => warmCamera.setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    const prewarm = () => void loadBarcodeReader();
    // iOS Safari has no requestIdleCallback.
    const idle = 'requestIdleCallback' in window;
    const handle = idle ? window.requestIdleCallback(prewarm, { timeout: 4000 }) : window.setTimeout(prewarm, 1500);

    return () => {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      document.removeEventListener('visibilitychange', onVisibility);
      warmCamera.setOwned(false);
    };
  }, []);
}
