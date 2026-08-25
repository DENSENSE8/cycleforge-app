import type { ScanDockHandlers, ScanDockHit, ScanDockMode } from './store';

/**
 * What the one bar did with a value. The dock renders this; it decides nothing
 * of its own.
 */
export type ScanDockOutcome =
  | { kind: 'delegated' }
  | { kind: 'hit'; hit: ScanDockHit }
  | { kind: 'filed'; value: string }
  | { kind: 'miss'; value: string };

export interface ScanDockSubmitArgs {
  mode: ScanDockMode;
  /** Already trimmed. */
  value: string;
  /** The active session's scan type — what `input` files a new record under. */
  scanType: string | null;
  handlers: ScanDockHandlers;
}

/**
 * The mode switch, as a pure function over the policy's handlers.
 *
 * The ruling it implements, in one line: **found in system → show the record
 * and its status; not found AND in input mode → input it under the active
 * session's type.**
 *
 * `scan` is deliberately outside that branch. It hands the value straight to
 * the surface's own resolver and returns — the scan path is the one this repo
 * works hardest to keep short, and making every trigger pull wait on a lookup
 * round trip to learn something the resolver is about to learn anyway would be
 * a tax on the most frequent action in the building.
 *
 * A surface with no `lookup` cannot answer "is this on file?", so search and
 * input both fall back to `scan` rather than silently reporting a miss on a
 * value that may well exist. A surface with no `onInput` cannot create, so
 * `input` degrades to `search` — a miss is reported, nothing is written.
 * Neither degradation is a default that hides a decision: both are the honest
 * consequence of a capability the surface did not publish.
 */
export async function runScanDockSubmit({
  mode,
  value,
  scanType,
  handlers,
}: ScanDockSubmitArgs): Promise<ScanDockOutcome> {
  if (mode === 'scan' || !handlers.lookup) {
    handlers.onSubmit(value);
    return { kind: 'delegated' };
  }

  const hit = await handlers.lookup(value, mode);
  if (hit) return { kind: 'hit', hit };

  if (mode === 'input' && handlers.onInput) {
    await handlers.onInput(value, scanType);
    return { kind: 'filed', value };
  }

  return { kind: 'miss', value };
}

/** Does this outcome mean the field should be emptied for the next scan? */
export function clearsFieldAfter(outcome: ScanDockOutcome): boolean {
  return outcome.kind === 'delegated' || outcome.kind === 'filed';
}
