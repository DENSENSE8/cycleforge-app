/**
 * The triage gate — the one place a build request's fate is decided.
 *
 * `triageBuildRequest` is a PURE function of a dedupe measurement. No DB, no
 * network, no model. That is deliberate and it is the security property:
 *
 *   • Purity makes the rule provable. The test beside this file asserts the
 *     >90% denial directly, without a database, a provider key, or a fixture
 *     org — so the proof runs on every `npm run verify`, not just when someone
 *     remembers to point it at a live DB.
 *
 *   • Taking a MEASUREMENT rather than a prompt means the model has no seam to
 *     reach into. It cannot supply the similarity, cannot re-run the search
 *     with friendlier wording, and cannot be asked politely to overlook a
 *     match — by the time this function runs, the number is already fixed.
 *
 * This is door one. Door two is in the migration: build_requests_duplicate_is_denied
 * and approval_reviews_duplicate_must_deny reject the INSERT itself, so even a
 * code path that never calls this function cannot record an approved duplicate.
 * A rule implemented in one door is a suggestion.
 */

import {
  DUPLICATE_DENY_THRESHOLD,
  type ApprovalReasonCode,
} from './constants';

/** A single tool_registry candidate with its measured similarity to the prompt. */
export interface ToolMatch {
  toolId: number;
  toolKey: string;
  name: string;
  sourcePath: string | null;
  /** Cosine similarity in [0,1] — `1 - (embedding <=> query)`. */
  similarity: number;
}

/**
 * The result of trying to dedupe a prompt against the registry.
 *
 * The two-armed shape is the point. A single `{ best: ToolMatch | null }` would
 * force "we could not check" and "we checked and found nothing" into the same
 * value, and the safe reading of those two is opposite: the first must deny,
 * the second must approve.
 */
export type DedupeOutcome =
  | { measured: true; best: ToolMatch | null; candidatesConsidered: number }
  | { measured: false; reason: string };

export interface TriageDecision {
  decision: 'approved' | 'denied';
  reasonCode: ApprovalReasonCode;
  /** Operator-facing sentence. Always populated, for approvals too. */
  exactReason: string;
  /** Present only on a duplicate denial — the row the panel deep-links to. */
  duplicateToolId: number | null;
  /** The measured cosine, or null when it could not be measured. Never 0-as-unknown. */
  similarity: number | null;
}

/**
 * Apply the duplicate rule to a dedupe measurement.
 *
 * Denies when: the best match exceeds DUPLICATE_DENY_THRESHOLD, or the search
 * could not be measured at all. Approves only on a real measurement that found
 * nothing close enough.
 */
export function triageBuildRequest(outcome: DedupeOutcome): TriageDecision {
  // ── Fail closed ───────────────────────────────────────────────────────────
  // An unmeasured dedupe is not a clean dedupe. The embedding provider being
  // down must not become a window during which every duplicate request is
  // approved — which is exactly what happens if this branch returns 'approved'
  // or if the caller passes similarity 0 for "unknown".
  if (!outcome.measured) {
    return {
      decision: 'denied',
      reasonCode: 'could_not_measure',
      exactReason:
        `Could not check this request against the existing tool registry (${outcome.reason}). ` +
        `Requests are denied rather than approved when the duplicate check cannot run, ` +
        `so nothing is built twice by accident. Try again once the check is available.`,
      duplicateToolId: null,
      similarity: null,
    };
  }

  const best = outcome.best;

  // ── The rule ──────────────────────────────────────────────────────────────
  // Strictly greater than: "> 90%" as specified, so a tool sitting exactly at
  // the threshold is not denied. The boundary is pinned by a test.
  if (best && best.similarity > DUPLICATE_DENY_THRESHOLD) {
    const pct = (best.similarity * 100).toFixed(1);
    return {
      decision: 'denied',
      reasonCode: 'duplicate_tool',
      exactReason:
        `This request is a ${pct}% semantic match for the existing tool "${best.name}" ` +
        `(${best.toolKey})${best.sourcePath ? ` at ${best.sourcePath}` : ''}, which is above the ` +
        `${(DUPLICATE_DENY_THRESHOLD * 100).toFixed(0)}% duplicate threshold. ` +
        `Use the existing tool, or reword the request to describe what it does not already do.`,
      duplicateToolId: best.toolId,
      similarity: best.similarity,
    };
  }

  // ── Cleared ───────────────────────────────────────────────────────────────
  const closest = best
    ? `Closest existing tool is "${best.name}" (${best.toolKey}) at ${(best.similarity * 100).toFixed(1)}%, ` +
      `below the ${(DUPLICATE_DENY_THRESHOLD * 100).toFixed(0)}% duplicate threshold.`
    : `No existing tool in this organization's registry resembles the request.`;

  return {
    decision: 'approved',
    reasonCode: 'approved_novel',
    exactReason:
      `Checked against ${outcome.candidatesConsidered} registered ` +
      `tool${outcome.candidatesConsidered === 1 ? '' : 's'}. ${closest}`,
    duplicateToolId: null,
    similarity: best ? best.similarity : null,
  };
}
