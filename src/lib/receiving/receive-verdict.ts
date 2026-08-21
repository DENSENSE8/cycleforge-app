/**
 * Receive verdict — what the station card is allowed to claim.
 *
 * The mark-received-po background sync has to answer ONE question for the
 * operator: did the receive really land? Until 2026-08-21 it answered with a
 * `Map<string, boolean>` in which four separate branches set `true` WITHOUT
 * calling the provider — an already-terminal PO, a PO with nothing pending, an
 * "already received" error string, and a local promotion whose result was never
 * checked. All four rendered as "Confirmed in inventory" while the PO sat in
 * transit and the receiving_line stayed at `EXPECTED` (which is what makes the
 * Incoming board compute `delivery_state = 'IN_TRANSIT'`).
 *
 * This module is the one place that rule lives. It is pure so it can be pinned
 * by a test instead of by a code review.
 *
 * @see src/app/api/receiving/mark-received-po/route.ts
 * @see src/lib/receiving/streets/incoming/delivery-state.ts — the RECEIVED arm
 */

/** What actually happened to one linked provider PO. */
export type ZohoPoOutcome =
  /** A purchase receive (or markasunreceived) reached the provider. */
  | 'posted'
  /** Nothing was sent ON PURPOSE — the provider is already at or ahead of us. */
  | 'noop'
  /** The provider call threw. */
  | 'failed';

/** The terminal answer published to the station card. */
export type ReceiveVerdict =
  /** A receive really posted AND every linked line committed locally. */
  | 'ok'
  /** Deliberate no-op, committed locally. Honest green — claims no write. */
  | 'skipped'
  /** The provider failed, OR it settled but the local promotion did not land. */
  | 'failed';

export interface ReceiveVerdictInput {
  /** Outcome per linked provider PO, in no particular order. */
  outcomes: readonly (ZohoPoOutcome | undefined)[];
  /** Lines that carry a provider PO link and must therefore reach DONE. */
  linkedLineIds: readonly number[];
  /** Lines whose local UNBOXED→DONE promotion actually committed. */
  promotedLineIds: ReadonlySet<number>;
  /** True when any line's promotion was refused or rolled back. */
  anyPromotionFailed: boolean;
}

/**
 * `undefined` means "publish no verdict" — there was nothing linked to judge.
 *
 * The asymmetry is deliberate: a provider outcome we never recorded counts as a
 * failure, never as a success. A missing entry is exactly the shape a silently
 * skipped branch produces, and the whole point of this module is that silence
 * is not consent.
 */
export function resolveReceiveVerdict(input: ReceiveVerdictInput): ReceiveVerdict | undefined {
  const { outcomes, linkedLineIds, promotedLineIds, anyPromotionFailed } = input;
  if (outcomes.length === 0) return undefined;

  const providerSettled = outcomes.every((o) => o === 'posted' || o === 'noop');
  const landedLocally =
    !anyPromotionFailed && linkedLineIds.every((id) => promotedLineIds.has(id));

  if (!providerSettled || !landedLocally) return 'failed';
  return outcomes.every((o) => o === 'posted') ? 'ok' : 'skipped';
}
