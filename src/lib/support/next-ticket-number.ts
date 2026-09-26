/** The number a ticket filed RIGHT NOW would land on. */

export type NextTicketNumber = {
  /** Predicted id for the next ticket filed on this account. */
  predicted: number;
  /** The newest ticket id the prediction was derived from. */
  observedLatest: number;
};

/** Derive the prediction from a page of tickets. */
export function predictNextTicketNumber(
  tickets: ReadonlyArray<{ id?: number | null }>,
): NextTicketNumber | null {
  let latest = 0;
  for (const t of tickets) {
    const id = Number(t?.id);
    if (Number.isInteger(id) && id > latest) latest = id;
  }
  // A brand-new Zendesk account with no tickets tells us nothing about where
  // the sequence starts, so answer "unknown" rather than guessing #1.
  if (latest <= 0) return null;
  return { predicted: latest + 1, observedLatest: latest };
}

/**
 * Face for the draft badge — the bare number, e.g.
 * No `#` and no `~` (operator ruling 2026-08-31): the corner already reads as a
 */
export function formatDraftTicketNumber(n: NextTicketNumber | null): string | null {
  return n ? String(n.predicted) : null;
}
