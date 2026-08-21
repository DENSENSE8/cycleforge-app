/**
 * Receive phase steps — the strings the welded feedback panel cycles through
 * while a receive is working.
 *
 * EVERY STEP IS A FACT. This is the shape a "thinking" ticker usually gets
 * wrong: a hardcoded script ("Querying carrier API…", "Resolving payload…")
 * that runs on a timer regardless of what the request is doing. On a scan
 * bench that is not flavour — it is chrome inventing a second story, which is
 * the first Kinetic Ledger law, and an operator who reads "Updating product
 * descriptions" on a receive that updated none has been lied to by the
 * instrument they are trusting.
 *
 * So the steps are DERIVED, not written:
 *
 *   - In flight, the only facts we hold are the intent and the elapsed time.
 *     `POST /api/receiving/mark-received-po` is a single round trip with no
 *     progress channel, so there are exactly two honest things to say: what
 *     was asked for, and — past {@link SLOW_RECEIVE_MS} — that it has not come
 *     back yet. No invented sub-stages.
 *   - Reconciling, the server has already ANSWERED. The summary names the
 *     writes that committed and the ones still settling in `after()`, so each
 *     line is something that actually happened while we wait for the realtime
 *     `zohoReceive` verdict. This is where a multi-step ticker has real
 *     content, which is why the loop lives here rather than in the request
 *     window.
 *
 * Pure + dependency-free so it is unit-testable with no DOM and no clock.
 */

import type { ReceiveIntent, ReceiveSummary } from './line-edit/hooks/useReceiveAction';

/** Past this, "still working" is itself a fact worth showing. */
export const SLOW_RECEIVE_MS = 6_000;

export type ReceivePhaseInput =
  | {
      phase: 'in_flight';
      intent: ReceiveIntent;
      /** Wall-clock ms since the POST left. */
      elapsedMs: number;
    }
  | {
      phase: 'reconciling';
      summary: ReceiveSummary;
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
      return 'Committing lines and sending the purchase receive';
  }
}

/**
 * The ordered steps for a phase. Never empty — a caller rendering a ticker with
 * nothing to say would blank the panel mid-receive.
 */
export function receivePhaseSteps(input: ReceivePhaseInput): string[] {
  if (input.phase === 'in_flight') {
    const steps = [inFlightVerb(input.intent)];
    if (input.elapsedMs >= SLOW_RECEIVE_MS) {
      // A real observation, not filler: the request is past the point where it
      // normally returns. Naming it beats cycling a script that implies
      // progress nobody measured.
      steps.push('Taking longer than usual — the request has not come back yet');
    }
    return steps;
  }

  const { summary } = input;
  const steps: string[] = [];
  if (summary.markedReceived) steps.push('Lines marked as received');
  if (summary.descriptionsUpdated > 0) {
    const n = summary.descriptionsUpdated;
    steps.push(`Wrote condition & serial to ${n} product description${n === 1 ? '' : 's'}`);
  }
  if (summary.notesUpdated) steps.push('Pushed notes to the purchase order');
  // The tail is the thing we are actually waiting on, and it is true whatever
  // the summary contained — so it also covers a summary with no named writes.
  steps.push('Waiting for the inventory system to confirm');
  return steps;
}
