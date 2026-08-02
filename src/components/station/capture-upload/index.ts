/**
 * Capture-upload visibility — the Station SoT for "what happened to the photo
 * I just took".
 *
 * Three layers, deliberately separable:
 *   - `capture-upload-model`  — pure vocabulary + summary law (no React)
 *   - `CaptureUploadStatus`   — the compound; plain props, imports no queue
 *   - `useCaptureUploadStatus`/`CaptureUploadDock` — the phone-side wiring
 *
 * A new bench renders `CaptureUploadStatus`. It does NOT fork a strip, and it
 * does not need the hook if its entries come from somewhere else — which is the
 * seam a desk-side surface uses in P1.
 *
 * Law: `.claude/rules/display/station.md` §6 (pass/fail is a card, not a toast).
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`.
 */

export { CaptureUploadStatus } from './CaptureUploadStatus';
export type { CaptureUploadStatusProps } from './CaptureUploadStatus';
export { CaptureUploadDock } from './CaptureUploadDock';
export { useCaptureUploadStatus } from './useCaptureUploadStatus';
export type { CaptureUploadStatusModel } from './useCaptureUploadStatus';
export {
  captureUploadKey,
  distinctFailureReasons,
  humanizeUploadError,
  summarizeCaptureUploads,
} from './capture-upload-model';
export type {
  CaptureUploadDomain,
  CaptureUploadEntry,
  CaptureUploadState,
  CaptureUploadSummary,
  CaptureUploadTone,
} from './capture-upload-model';
