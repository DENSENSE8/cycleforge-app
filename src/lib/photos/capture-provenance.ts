/** Device-reported capture provenance for a photo — the wire contract between the capture surfaces and `photos.client_captured_at`… */

/**
 * Multipart field name carrying the capture instant on `POST /api/photos/upload`.
 * Shared by `uploadPhotoClient` (writer) and the route (reader) so the two can
 * never drift apart by a typo.
 */
export const CLIENT_CAPTURED_AT_FIELD = 'clientCapturedAt';

/** Floor for a believable capture instant (2000-01-01T00:00:00Z). */
const MIN_CAPTURE_MS = Date.UTC(2000, 0, 1);

/** Tolerance for a device clock running ahead. */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** Normalize a device-supplied capture instant into a `Date`, or `null`. */
export function parseClientCapturedAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;

  // Epoch milliseconds (File.lastModified). Bounded length so a stray digit
  // string can't be read as a microsecond/nanosecond clock.
  const ms = /^\d{1,15}$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(ms)) return null;

  // Bounds-check the EPOCH, before constructing anything a formatter could silently coerce (`formatApiInstant` maps an invalid Date to 1970…
  if (ms < MIN_CAPTURE_MS) return null;
  if (ms > Date.now() + MAX_FUTURE_SKEW_MS) return null;

  return new Date(ms);
}
