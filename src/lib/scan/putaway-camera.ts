/**
 * putaway-camera — the camera half of the input truth layer, for the phone
 * put-away path.
 *
 * Plan of record: docs/warehouse-os/00-endgame.md — "scan any QR and the
 * location is never wrong." D10 says a location is a fact created by a scan,
 * and only a scan; on a phone at the shelf the scan is the camera. This module
 * wraps the BarcodeDetector web API into one seam: open the environment
 * camera, watch frames, and hand each DISTINCT decoded value to the caller
 * exactly once. The CALLER stamps what it receives as
 * `{ value, source: 'camera' }` — the lawful sibling of the wedge layer's
 * `'scanner'` stamp (src/hooks/useFindFieldScan.ts).
 *
 * ## Debounce contract
 *
 * A camera pointed at a label decodes the same value on every frame. One
 * physical scan must become one `onScan`, so a value re-fires only when it is
 * DIFFERENT from the last one seen, or after {@link REPEAT_QUIET_MS} of not
 * being seen (walk away, come back — that is a new scan). Continuous sight of
 * the same label refreshes the quiet clock and never re-fires.
 *
 * ## Failure contract
 *
 * - No BarcodeDetector / no getUserMedia → {@link CameraUnsupportedError}
 *   (feature-detect first with {@link isBarcodeCameraSupported}).
 * - Permission refused → {@link CameraDeniedError}, tracks never opened.
 * - A detector hiccup on ONE frame (video not ready yet, transient decode
 *   error) is swallowed and the next tick tries again — a shaky hand must not
 *   kill the session.
 *
 * Collaborators are injected (real impls by default) so the module is
 * unit-testable with zero DOM — same Deps shape as
 * src/lib/inventory/placements.ts. See putaway-camera.test.ts.
 */

/** How often a frame is offered to the detector. ~3 fps is plenty for a label. */
export const DEFAULT_SCAN_INTERVAL_MS = 300;

/** How long a value must go UNSEEN before the same label counts as a new scan. */
export const REPEAT_QUIET_MS = 1500;

/** The one field of a DetectedBarcode this module reads. */
export interface DetectedBarcodeLike {
  readonly rawValue: string;
}

/** The narrow slice of BarcodeDetector this module uses (fakes implement 1 line). */
export interface BarcodeDetectorLike {
  detect(source: CameraVideoSurface): Promise<ReadonlyArray<DetectedBarcodeLike>>;
}

/** BarcodeDetector is not in TS's dom lib yet — the ctor shape, declared here. */
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

type WindowWithBarcodeDetector = Window & { BarcodeDetector?: BarcodeDetectorCtor };

/**
 * The narrow slice of HTMLVideoElement this module touches — a real
 * `<video muted playsInline>` satisfies it structurally; a fake is 2 lines.
 */
export interface CameraVideoSurface {
  srcObject: unknown;
  play(): Promise<void>;
}

/** The narrow slice of a MediaStreamTrack: stop() releases the hardware. */
export interface MediaTrackLike {
  stop(): void;
}

/** The narrow slice of a MediaStream: enumerate tracks so stop() frees them all. */
export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
}

/** Thrown when the camera permission is refused. Callers show the D10 fallback. */
export class CameraDeniedError extends Error {
  constructor(cause: unknown) {
    super(
      'Camera permission was denied — the put-away path needs the camera to ' +
        'scan location labels (a location is a fact created by a scan).',
      { cause },
    );
    this.name = 'CameraDeniedError';
  }
}

/** Thrown when BarcodeDetector or getUserMedia does not exist here (or in SSR). */
export class CameraUnsupportedError extends Error {
  constructor() {
    super(
      'BarcodeDetector / getUserMedia are unavailable in this environment — ' +
        'feature-detect with isBarcodeCameraSupported() before starting.',
    );
    this.name = 'CameraUnsupportedError';
  }
}

/** Injectable collaborators — real impls by default, fakes in tests. */
export interface PutawayCameraDeps {
  /** navigator.mediaDevices.getUserMedia, isolated so tests never need a DOM. */
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  /** `new window.BarcodeDetector(...)` — no formats means "everything you can read". */
  createDetector: (formats?: ReadonlyArray<string>) => BarcodeDetectorLike;
  /** The debounce clock. */
  now: () => number;
  /** Run `tick` every `intervalMs`; returns cancel. Default: setInterval. */
  schedule: (tick: () => void | Promise<void>, intervalMs: number) => () => void;
}

export const defaultPutawayCameraDeps: PutawayCameraDeps = {
  getUserMedia: (constraints) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(new CameraUnsupportedError());
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  createDetector: (formats) => {
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!Ctor) throw new CameraUnsupportedError();
    return formats && formats.length > 0 ? new Ctor({ formats: [...formats] }) : new Ctor();
  },
  now: () => Date.now(),
  schedule: (tick, intervalMs) => {
    const id = setInterval(() => {
      void tick();
    }, intervalMs);
    return () => clearInterval(id);
  },
};

/** SSR-safe feature check: BarcodeDetector AND camera access both exist. */
export function isBarcodeCameraSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasDetector =
    typeof (window as WindowWithBarcodeDetector).BarcodeDetector === 'function';
  const media = navigator.mediaDevices;
  return hasDetector && media != null && typeof media.getUserMedia === 'function';
}

export interface StartBarcodeCameraOptions {
  /** BarcodeDetector formats (e.g. ['qr_code','code_128']). Omit = all supported. */
  formats?: ReadonlyArray<string>;
  /** Frame-poll cadence. Default {@link DEFAULT_SCAN_INTERVAL_MS}. */
  intervalMs?: number;
}

/** True for the DOMException names every engine uses for a refused permission. */
function isPermissionDenial(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError' ||
      err.name === 'SecurityError')
  );
}

/**
 * Open the environment-facing camera into `video` and scan frames until the
 * returned stop() is called. `onScan` fires once per distinct decoded value
 * (see the debounce contract in the module docblock).
 *
 * stop() is idempotent: it cancels the frame loop, stops EVERY media track
 * (the hardware light goes off), and detaches the stream from the video.
 */
export async function startBarcodeCamera(
  video: CameraVideoSurface,
  onScan: (value: string) => void,
  opts: StartBarcodeCameraOptions = {},
  deps: PutawayCameraDeps = defaultPutawayCameraDeps,
): Promise<() => void> {
  // Detector first — an unsupported environment must fail BEFORE the
  // permission prompt ever shows.
  const detector = deps.createDetector(opts.formats);

  let stream: MediaStreamLike;
  try {
    stream = await deps.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (err) {
    if (isPermissionDenial(err)) throw new CameraDeniedError(err);
    throw err;
  }

  const releaseTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  video.srcObject = stream;
  try {
    await video.play();
  } catch (err) {
    // play() refused (autoplay policy, interrupted load): a stream nothing
    // renders would leak the camera — release it and surface the refusal.
    releaseTracks();
    video.srcObject = null;
    throw err;
  }

  let stopped = false;
  let busy = false;
  let lastValue: string | null = null;
  let lastSeenAt = 0;

  const tick = async (): Promise<void> => {
    if (stopped || busy) return; // never overlap detects on a slow decode
    busy = true;
    try {
      const detections = await detector.detect(video);
      if (stopped) return;
      const hit = detections.find((d) => d.rawValue.length > 0);
      if (!hit) return;
      const at = deps.now();
      const distinct = hit.rawValue !== lastValue;
      const quiet = at - lastSeenAt >= REPEAT_QUIET_MS;
      if (distinct || quiet) onScan(hit.rawValue);
      // Every sighting refreshes the clock: continuous view never re-fires.
      lastValue = hit.rawValue;
      lastSeenAt = at;
    } catch {
      // One bad frame (video not ready, transient decode error) — swallow,
      // the next tick tries again.
    } finally {
      busy = false;
    }
  };

  const cancel = deps.schedule(tick, opts.intervalMs ?? DEFAULT_SCAN_INTERVAL_MS);

  return () => {
    if (stopped) return; // idempotent
    stopped = true;
    cancel();
    releaseTracks();
    video.srcObject = null;
  };
}
