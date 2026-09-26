/** Receive phase steps — the strings the welded feedback panel cycles through while a receive request is in flight. */

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
