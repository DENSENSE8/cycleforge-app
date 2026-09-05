/**
 * Capture stack — the house bottom-anchored capture primitive.
 *
 * The renderer and its behavior hook are ONE unit: bottom-anchoring is split
 * across `CaptureStack` (the `mt-auto` short-list pin) and
 * `useCaptureStackWindow` (row order + auto-scroll). Import both from here.
 */

export { CaptureStack } from './CaptureStack';
export { CaptureStackRow } from './CaptureStackRow';
export { CaptureStackSkeleton } from './CaptureStackSkeleton';
export { useCaptureStackWindow, useCaptureStackQuery } from './useCaptureStack';

// The prop/option types stay exported from their own modules (import them from
// './CaptureStack' / './useCaptureStack' directly). Re-exporting them here would
// duplicate every one as a second unused export in the knip ledger — this
// promotion is a rename and must stay net-neutral against the baseline.
