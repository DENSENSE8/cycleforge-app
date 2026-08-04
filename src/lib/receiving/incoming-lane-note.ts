/**
 * The Incoming lane note — and, more importantly, when it must NOT render.
 *
 * On the default Incoming lane, *"not received in the purchasing source"* is a
 * CONSTANT, not a variable: `NOT_ZOHO_RECEIVED_PREDICATE` is in that query's
 * `WHERE`, so every row satisfies it by construction. A per-row chip would
 * therefore paint one identical value on 100% of rows — ink that teaches
 * operators to stop reading chips. The fact belongs at LANE altitude, said once.
 *
 * **The visibility rule is the correctness half.** The note is a claim about
 * the active query, true only while the predicate holds, so it must disappear
 * the moment any filter relaxes it. A lane note that outlives its predicate is
 * worse than no note: it is a confident false statement sitting directly above
 * the rows that contradict it.
 *
 * Pure + dependency-light so the gate is unit-testable and lives in ONE place,
 * never as a hand-maintained list of param names at the call site.
 */

/** Everything the gate needs about the active query. */
interface IncomingLaneNoteInput {
  /** The lane being rendered. */
  view: 'incoming' | 'incoming_removed' | (string & {});
  /** `?tracking_in=` is active — the predicate is deliberately relaxed. */
  trackingFiltered: boolean;
  /** How many rows the lane is showing right now. */
  rowCount: number;
  /** Provider display label when a purchasing source is connected. */
  providerLabel?: string | null;
}

interface IncomingLaneNote {
  text: string;
  tip: string;
}

/**
 * The note for this query, or `null` when it would be false or noise.
 *
 * Suppressed when:
 * - the lane is not `incoming` (the removed lane exists to SHOW removed rows);
 * - `?tracking_in=` is active (that param relaxes the very predicate stated);
 * - the lane is empty (a caption stacked on a teaching empty is noise).
 *
 * A delivery-state facet does NOT suppress it: those facets narrow WITHIN the
 * predicate rather than relaxing it, so the claim stays true.
 */
export function resolveIncomingLaneNote(
  input: IncomingLaneNoteInput,
): IncomingLaneNote | null {
  if (input.view !== 'incoming') return null;
  if (input.trackingFiltered) return null;
  if (input.rowCount <= 0) return null;

  // Capability noun when no provider is connected — never a hardcoded vendor
  // product sentence in operator copy (AGENTS.md → capability nouns).
  const source = String(input.providerLabel ?? '').trim() || 'your purchasing source';

  return {
    text: `None of these are received in ${source} — the list drops a PO the moment it is marked received.`,
    tip:
      'A purchase order leaves this list as soon as the purchasing source reports it received, billed or closed. '
      + 'If a box is physically here but the PO already shows received upstream, it will not appear here — '
      + 'paste its tracking number to find it.',
  };
}
