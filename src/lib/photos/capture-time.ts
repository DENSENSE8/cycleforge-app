/** Reading a photo's capture instant ON THE DEVICE — the client half of the `photos.client_captured_at` contract (wire format + bounds live… */

import { parseClientCapturedAt } from './capture-provenance';

/** Validate a candidate epoch-millisecond capture instant, or `null`. */
export function normalizeCaptureTimeMs(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return parseClientCapturedAt(String(Math.trunc(ms)))?.getTime() ?? null;
}

/** Capture instant for a photo that arrived as a `File` — a desktop drag-drop, a gallery pick, or an `<input type="file" capture>` shot. */
export function captureTimeFromFile(source: Blob | File | null | undefined): number | null {
  if (!source) return null;
  const lastModified = (source as Partial<File>).lastModified;
  return typeof lastModified === 'number' ? normalizeCaptureTimeMs(lastModified) : null;
}

/** Capture instant for a canvas/`getUserMedia` shot, which has no `File` and so no `lastModified` to read. */
export function shutterCaptureTime(): number {
  return Date.now();
}
