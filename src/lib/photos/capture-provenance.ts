/**
 * Device-reported capture provenance for a photo — the wire contract between
 * the capture surfaces and `photos.client_captured_at`
 * (migration `2026-07-29b_photos_client_captured_at.sql`).
 *
 * WHY THIS EXISTS: `photos.created_at` is the server-INSERT instant. For a
 * queued mobile upload (`src/components/mobile/receiving/PhotoUploadQueue.ts`
 * persists to localStorage and drains on reconnect) that can be minutes-to-
 * hours after the shutter fired, and a carrier concealed-damage dispute turns
 * on WHEN the evidence was captured. So the device reports its own capture
 * instant as an explicit field and we store it beside — never instead of —
 * `created_at`.
 *
 * WHY THE DEVICE AND NOT AN EXIF PARSE: EXIF does not survive to the server on
 * the surface that matters. `src/lib/image/downscale.ts` re-encodes through a
 * `<canvas>` → `toBlob('image/jpeg')` on every mobile capture, which drops all
 * metadata; its passthrough only fires for an already-small JPEG, which a phone
 * camera shot never is. A server-side EXIF read would therefore succeed on
 * desktop and silently fail at the unbox bench. The timestamp must be read on
 * the device BEFORE downscale runs, and travel as its own field.
 *
 * NOT SERVER-ATTESTED. Every value here comes from the operator's device clock.
 * A tablet with a drifted clock yields a wrong-but-plausible instant. Callers
 * that need a defensible timestamp keep reading `created_at`.
 *
 * This module is intentionally pure and dependency-free so a client bundle can
 * import the field name and the normalizer without dragging any server graph
 * along (`.claude/rules/build-gotchas.md` → bundle altitude).
 */

/**
 * Multipart field name carrying the capture instant on `POST /api/photos/upload`.
 * Shared by `uploadPhotoClient` (writer) and the route (reader) so the two can
 * never drift apart by a typo.
 */
export const CLIENT_CAPTURED_AT_FIELD = 'clientCapturedAt';

/**
 * Floor for a believable capture instant (2000-01-01T00:00:00Z).
 *
 * This is not decoration — it is the main defense. `File.lastModified` is `0`
 * on several mobile browsers for a camera-input File, and an epoch-0 date is
 * exactly the "wrong but plausible-looking" value this column must never hold.
 * A `Date(0)` in an evidence panel reads as data; a NULL reads as "unknown",
 * which is the truth.
 */
const MIN_CAPTURE_MS = Date.UTC(2000, 0, 1);

/**
 * Tolerance for a device clock running ahead. A warehouse tablet that never
 * synced NTP can be hours fast, and rejecting that would throw away a usable
 * (if imprecise) fact; a value days in the future is a broken clock, not a
 * capture. 24h is the line.
 */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize a device-supplied capture instant into a `Date`, or `null`.
 *
 * Accepts either an ISO-8601 instant (`2026-07-29T18:04:11.000Z`) or an
 * epoch-millisecond integer as a string (`File.lastModified` verbatim), because
 * both are one line for a capture surface to produce and neither is ambiguous.
 *
 * **Never throws, and never fabricates.** Absent, empty, malformed, or
 * out-of-bounds all collapse to `null` — the honest value for "no capture time
 * known". Provenance is a secondary fact on an evidence upload: a client that
 * ships a malformed timestamp must lose the timestamp, not the photo. Callers
 * that want the failure to be loud can compare a non-empty input against a
 * `null` result and log it (the upload route does exactly that).
 */
export function parseClientCapturedAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;

  // Epoch milliseconds (File.lastModified). Bounded length so a stray digit
  // string can't be read as a microsecond/nanosecond clock.
  const ms = /^\d{1,15}$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(ms)) return null;

  // Bounds-check the EPOCH, before constructing anything a formatter could
  // silently coerce (`formatApiInstant` maps an invalid Date to 1970 rather
  // than failing, which is precisely the fabricated-evidence outcome the NULL
  // contract exists to prevent).
  if (ms < MIN_CAPTURE_MS) return null;
  if (ms > Date.now() + MAX_FUTURE_SKEW_MS) return null;

  return new Date(ms);
}
