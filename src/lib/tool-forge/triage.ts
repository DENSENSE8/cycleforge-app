/**
 * The triage gate — the one place a build request's fate is decided.
 * network, no model. That is deliberate and it is the security property:
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

/** The result of trying to dedupe a prompt against the registry. */
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

/** Apply the duplicate rule to a dedupe measurement. */
export function triageBuildRequest(outcome: DedupeOutcome): TriageDecision {
  // ── Fail closed ─────────────────────────────────────────────────────────── An unmeasured dedupe is not a clean dedupe.
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
