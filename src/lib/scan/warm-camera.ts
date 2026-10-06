/**
 * The phone's warm lens — one camera stream kept alive between scan screens.
 *
 * The scan → location → scan loop unmounts the capture window on every hop.
 * Re-acquiring the lens each time costs a `getUserMedia` round (device open,
 * constraint negotiation, focus hunt) before the first frame; parking the
 * stream for a short grace makes the return trip a reattach. The decode loop
 * is NOT parked: a parked stream feeds no decoder, so it burns no CPU.
 *
 * Release rules (never a lit lens nobody can reach):
 * - not reattached within {@link CAMERA_KEEPALIVE_GRACE_MS};
 * - the page goes hidden (app switch, lock, tab change);
 * - the owner (the `/m` shell) unmounts — leaving the mobile shell;
 * - outside an owner, or while hidden, nothing parks: the stream is disposed.
 */
import type { BrowserMultiFormatReader } from '@zxing/browser';
import type { DecodeHintType } from '@zxing/library';

/**
 * How long a parked lens waits to be reattached. One location visit — read the
 * shelf, count, a few ±1 taps, back to Scan — runs well inside a minute; 90 s
 * covers a slow count without leaving the light on long after the operator has
 * walked away from scanning.
 */
export const CAMERA_KEEPALIVE_GRACE_MS = 90_000;

export interface CameraKeepalive<T> {
  /** Hold `resource` for a reattach; disposes any earlier parked one. Disposed at once when unowned or hidden. */
  park(resource: T): void;
  /** Hand back the parked resource (cancelling its release), or null. A dead one is disposed, not returned. */
  take(): T | null;
  /** Whether a resource is parked right now. */
  holding(): boolean;
  /** Dispose the parked resource now — or only `resource`, when it is the parked one. */
  release(resource?: T): void;
  /** The owner mounted (true) or left (false — releases). */
  setOwned(owned: boolean): void;
  /** The page went hidden (true — releases) or visible again. */
  setHidden(hidden: boolean): void;
}

export function createCameraKeepalive<T>({
  dispose,
  isLive,
  graceMs = CAMERA_KEEPALIVE_GRACE_MS,
}: {
  dispose: (resource: T) => void;
  isLive: (resource: T) => boolean;
  graceMs?: number;
}): CameraKeepalive<T> {
  let parked: T | null = null;
  /** Bumped per park/unpark, so a grace timer left behind by an earlier park is a no-op. */
  let parkSeq = 0;
  let owned = false;
  let hidden = false;

  const unpark = (): T | null => {
    parkSeq += 1;
    const held = parked;
    parked = null;
    return held;
  };

  const release = (resource?: T) => {
    if (parked === null || (resource !== undefined && resource !== parked)) return;
    const held = unpark();
    if (held !== null) dispose(held);
  };

  return {
    park(resource) {
      if (resource === parked) return;
      release();
      if (!owned || hidden) {
        dispose(resource);
        return;
      }
      parked = resource;
      const seq = parkSeq;
      setTimeout(() => {
        if (seq === parkSeq) release();
      }, graceMs);
    },
    take() {
      const held = unpark();
      if (held === null || isLive(held)) return held;
      dispose(held);
      return null;
    },
    holding: () => parked !== null,
    release,
    setOwned(next) {
      owned = next;
      if (!next) release();
    },
    setHidden(next) {
      hidden = next;
      if (next) release();
    },
  };
}

/** Stops every track — the camera light goes out with the last one. */
export function stopCameraStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** A stream worth reattaching: every video track still live and unmuted (iOS mutes a lens another capture took). */
export function cameraStreamIsLive(stream: MediaStream): boolean {
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === 'live' && !t.muted);
}

/** The page's one warm lens. Owned by the `/m` shell (`useWarmCameraOwner`). */
export const warmCamera = createCameraKeepalive<MediaStream>({
  dispose: stopCameraStream,
  isLive: cameraStreamIsLive,
});

let readerLoad: Promise<BrowserMultiFormatReader> | null = null;

/**
 * The barcode reader, loaded once per page. ZXing is a large chunk, so it is
 * imported on demand — and pre-warmed by the `/m` shell on idle, which never
 * asks for camera permission. A failed chunk load is forgotten so the next
 * start retries it.
 */
export function loadBarcodeReader(): Promise<BrowserMultiFormatReader> {
  readerLoad ??= Promise.all([import('@zxing/browser'), import('@zxing/library')]).then(
    ([{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }]) => {
      const hints = new Map<DecodeHintType, unknown>([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODABAR,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_128,
            BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.ITF,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ],
        ],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      return new BrowserMultiFormatReader(hints);
    },
  );
  readerLoad.catch(() => {
    readerLoad = null;
  });
  return readerLoad;
}
