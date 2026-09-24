/**
 * Receive phase steps — the strings the welded feedback panel cycles through
 * while a receive request is in flight.
 *
 * EVERY STEP IS A FACT. This is the shape a "thinking" ticker usually gets
 * wrong: a hardcoded script ("Querying carrier API…", "Resolving payload…")
 * that runs on a timer regardless of what the request is doing. On a scan
 * bench that is not flavour — it is chrome inventing a second story, which is
 * the first Kinetic Ledger law, and an operator who reads "Updating product
 * descriptions" on a receive that updated none has been lied to by the
 * instrument they are trusting.
 *
 * So the steps are DERIVED, not written. In flight, the only facts we hold are
 * the intent and the elapsed time. `POST /api/receiving/mark-received-po` is a
 * single round trip with no progress channel, so there are exactly two honest
 * things to say: what was asked for, and — past {@link SLOW_RECEIVE_MS} — that
 * it has not come back yet. No invented sub-stages.
 *
 * The request commits locally and nothing else: the inventory purchase receive
 * is drained afterwards by the scheduled receive backfill, whose backlog is the
 * only place that signal lives. So there is no post-response phase to narrate —
 * when the response lands, the panel is settled.
 *
 * Pure + dependency-free so it is unit-testable with no DOM and no clock.
 */

import type { ReceiveIntent } from './line-edit/hooks/useReceiveAction';

/** Past this, "still working" is itself a fact worth showing. */
export const SLOW_RECEIVE_MS = 6_000;

export type ReceivePhaseInput = {
  intent: ReceiveIntent;
  /** Wall-clock ms since the POST left. */
  elapsedMs: number;
};

/** What the operator asked the server to do — one line, from the intent. */
function inFlightVerb(intent: ReceiveIntent): string {
  switch (intent) {
    case 'unreceive':
      return 'Unreceiving — clearing received quantities';
    case 'scan_only':
      return 'Saving quantities as Scanned';
    case 'local_receive':
      return 'Receiving locally — inventory not involved';
    default:
      return 'Committing received lines';
  }
}

/**
 * The ordered steps for the in-flight request. Never empty — a caller rendering
 * a ticker with nothing to say would blank the panel mid-receive.
 */
export function receivePhaseSteps(input: ReceivePhaseInput): string[] {
  const steps = [inFlightVerb(input.intent)];
  if (input.elapsedMs >= SLOW_RECEIVE_MS) {
    // A real observation, not filler: the request is past the point where it
    // normally returns. Naming it beats cycling a script that implies progress
    // nobody measured.
    steps.push('Taking longer than usual — the request has not come back yet');
  }
  return steps;
}
