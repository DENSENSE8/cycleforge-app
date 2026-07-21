/**
 * Pack verification outcome vocabulary + state machine — the CLIENT-SAFE SoT
 * (no server-only imports) shared by the server writer
 * (recordPackVerificationEvent), the mobile capture flow, and the Review
 * station UI. Plan: docs/todo/packer-review-station-plan.md Phase 3.
 */

/** The append-only outcome vocabulary — pinned byte-for-byte against the DB
 *  CHECK (`pack_verification_events_outcome_chk`) in pack-verification.test.ts. */
export const PACK_VERIFICATION_OUTCOMES = [
  'UNVERIFIED',
  'VERIFIED',
  'REVIEW_APPROVED',
  'REVIEW_FLAGGED',
  'READY',
  'ERROR_MISSING_TRACKING',
  'ERROR_COUNT_MISMATCH',
  'ERROR_OCR_FAILED',
] as const;

export type PackVerificationOutcome = (typeof PACK_VERIFICATION_OUTCOMES)[number];

/** Packer-floor capture outcomes (may fire from the empty / capture state). */
const CAPTURE_OUTCOMES = new Set<PackVerificationOutcome>([
  'UNVERIFIED',
  'VERIFIED',
  'ERROR_MISSING_TRACKING',
  'ERROR_OCR_FAILED',
]);
/** Manager review outcomes (may fire only after a capture landed). */
const REVIEW_OUTCOMES = new Set<PackVerificationOutcome>(['REVIEW_APPROVED', 'REVIEW_FLAGGED']);
/** End-of-day reconciliation outcomes (may fire only after manager approval). */
const EOD_OUTCOMES = new Set<PackVerificationOutcome>(['READY', 'ERROR_COUNT_MISMATCH']);

export function isPackVerificationOutcome(v: unknown): v is PackVerificationOutcome {
  return typeof v === 'string' && (PACK_VERIFICATION_OUTCOMES as readonly string[]).includes(v);
}

export type PackOutcomeTone = 'info' | 'success' | 'warning' | 'danger' | 'muted';

/** Presentation-kind SoT: outcome → operator label + semantic tone. Views map
 *  the tone to chip classes; they never inline an outcome→hue map (house rule). */
const PACK_OUTCOME_META: Record<PackVerificationOutcome, { label: string; tone: PackOutcomeTone }> = {
  UNVERIFIED: { label: 'Unverified', tone: 'muted' },
  VERIFIED: { label: 'Verified', tone: 'info' },
  REVIEW_APPROVED: { label: 'Approved', tone: 'success' },
  REVIEW_FLAGGED: { label: 'Flagged', tone: 'danger' },
  READY: { label: 'Ready', tone: 'success' },
  ERROR_MISSING_TRACKING: { label: 'No tracking match', tone: 'warning' },
  ERROR_COUNT_MISMATCH: { label: 'Count mismatch', tone: 'warning' },
  ERROR_OCR_FAILED: { label: 'OCR failed', tone: 'warning' },
};

/** Resolve any stored outcome string (queue rows are typed loosely) to its meta,
 *  falling back to a muted raw-label chip for a value the UI doesn't know yet. */
export function packOutcomeMeta(outcome: string): { label: string; tone: PackOutcomeTone } {
  return isPackVerificationOutcome(outcome)
    ? PACK_OUTCOME_META[outcome]
    : { label: outcome, tone: 'muted' };
}

/**
 * The outcome state machine (plan §3c). Given the current latest outcome for a
 * packer_log (or null when none exists yet), is `next` a legal insert?
 *   • capture outcomes  — legal from {none} ∪ capture (packer (re)captures until review),
 *   • review outcomes   — legal only when latest is VERIFIED or any ERROR_*,
 *   • EOD outcomes      — legal only when latest is REVIEW_APPROVED.
 */
export function canTransitionPackVerification(
  latest: PackVerificationOutcome | null,
  next: PackVerificationOutcome,
): boolean {
  if (CAPTURE_OUTCOMES.has(next)) {
    return latest === null || CAPTURE_OUTCOMES.has(latest);
  }
  if (REVIEW_OUTCOMES.has(next)) {
    return latest === 'VERIFIED' || (latest !== null && latest.startsWith('ERROR_'));
  }
  if (EOD_OUTCOMES.has(next)) {
    return latest === 'REVIEW_APPROVED';
  }
  return false;
}
