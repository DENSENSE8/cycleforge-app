/**
 * Reading a photo's capture instant ON THE DEVICE — the client half of the
 * `photos.client_captured_at` contract (wire format + bounds live in
 * `./capture-provenance.ts`, which this module reuses rather than re-deriving).
 *
 * WHY THE DEVICE READS IT: `photos.created_at` is the server-INSERT instant. A
 * queued mobile upload persists to localStorage and drains on reconnect, so for
 * the carton photos that settle carrier concealed-damage disputes that INSERT
 * can land minutes-to-hours after the shutter fired. The capture instant has to
 * be captured where and when the capture happened.
 *
 * WHY NOT A SERVER-SIDE EXIF PARSE: on the surface that matters there is no EXIF
 * left to parse — and often no EXIF to begin with:
 *   • The mobile studios capture from `getUserMedia` → `<canvas>` → `toBlob`
 *     (`MobilePackerSpamCamera`). That blob is synthesized in the page; it has
 *     never had an EXIF block at all.
 *   • Everything that DOES arrive as a File is then re-encoded by
 *     `src/lib/image/downscale.ts` through `<canvas>` → `toBlob('image/jpeg')`,
 *     which drops all metadata. Its passthrough branch needs
 *     (`!scaled && bytes < 400_000 && type === 'image/jpeg'`) — a phone camera
 *     shot fails all three.
 * A server parse would therefore succeed on desktop and silently fail at the
 * unbox bench, which is exactly backwards.
 *
 * WHY NOT A CLIENT-SIDE EXIF PARSE EITHER (the considered tradeoff): a correct
 * `DateTimeOriginal` read means walking JPEG APP1 segments, a TIFF header with
 * either endianness, and two IFDs — ~1.5 KB into every station bundle that can
 * reach a capture surface (`.claude/rules/build-gotchas.md` → bundle altitude).
 * The decisive problem is not size, though: **EXIF `DateTimeOriginal` carries no
 * timezone.** It is local wall-clock text (`2026:07:29 11:04:11`), so turning it
 * into the instant a TIMESTAMPTZ column stores requires ASSUMING a zone — and a
 * guessed zone on a photo that crossed a device or a border is a fabricated
 * instant wearing a precise-looking mask. `File.lastModified` is already an
 * unambiguous epoch-millisecond instant, and for a camera-input File it is the
 * moment the camera app wrote the file. So: `lastModified` for Files, the
 * shutter wall clock for canvas captures, and no EXIF anywhere.
 *
 * NOT SERVER-ATTESTED. Every value here is the operator's device clock. A
 * tablet that never synced NTP yields a wrong-but-plausible instant; that is why
 * this is stored BESIDE `created_at` and never instead of it.
 *
 * Pure and dependency-free — safe to import from any client bundle.
 */

import { parseClientCapturedAt } from './capture-provenance';

/**
 * Validate a candidate epoch-millisecond capture instant, or `null`.
 *
 * Delegates the bounds to `parseClientCapturedAt` so the client and the route
 * agree by construction: a value this returns is a value the server will store,
 * and a value this drops is one the server would have dropped anyway (with a
 * warn log). Duplicating the floor/ceiling here is how the two silently drift.
 *
 * The floor matters most on this side: `File.lastModified` is `0` on several
 * mobile browsers for a camera-input File, and an epoch-0 date in an evidence
 * panel reads as data when the truth is "unknown".
 */
export function normalizeCaptureTimeMs(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return parseClientCapturedAt(String(Math.trunc(ms)))?.getTime() ?? null;
}

/**
 * Capture instant for a photo that arrived as a `File` — a desktop drag-drop,
 * a gallery pick, or an `<input type="file" capture>` shot.
 *
 * Returns `null` for a bare `Blob` (canvas capture — use {@link shutterCaptureTime}
 * at the shutter instead) and for any `lastModified` that fails the shared
 * bounds. Never throws.
 */
export function captureTimeFromFile(source: Blob | File | null | undefined): number | null {
  if (!source) return null;
  const lastModified = (source as Partial<File>).lastModified;
  return typeof lastModified === 'number' ? normalizeCaptureTimeMs(lastModified) : null;
}

/**
 * Capture instant for a canvas/`getUserMedia` shot, which has no `File` and so
 * no `lastModified` to read.
 *
 * Call this at the FRAME GRAB, not after the encode: `toBlob` plus
 * `compressPhotoForUpload` can run for a noticeable fraction of a second on a
 * warehouse phone, and the instant we want is when the operator saw the shutter
 * fire — not when the JPEG finished encoding.
 */
export function shutterCaptureTime(): number {
  return Date.now();
}
