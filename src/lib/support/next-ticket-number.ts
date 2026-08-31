/**
 * The number a ticket filed RIGHT NOW would land on.
 *
 * Zendesk has no reserve-an-id endpoint and no draft-ticket concept — an id is
 * minted by `POST /tickets.json` and read back off the response. So the draft
 * number an operator sees before they file is a **prediction**, derived the only
 * way the API allows: read the newest ticket on the account and add one, because
 * Zendesk ticket ids are a per-account monotonic sequence.
 *
 * IT CAN BE WRONG, and the surface that shows it has to say so. Anyone else —
 * another agent, an inbound email, an automation — filing a ticket between the
 * read and the operator pressing File shifts the number. That is why the badge
 * flashes and is labelled a draft: it is the number this claim is *heading for*,
 * not a reservation. Never print it on a label, never send it to a customer, and
 * never write it to `support_tickets` — the real id comes back from the create
 * call and is the only one that goes in the record.
 */

export type NextTicketNumber = {
  /** Predicted id for the next ticket filed on this account. */
  predicted: number;
  /** The newest ticket id the prediction was derived from. */
  observedLatest: number;
};

/**
 * Derive the prediction from a page of tickets. Pure, so the arithmetic and the
 * empty-account case are testable without the network.
 *
 * Takes the MAX id rather than the first row: the list is sorted by
 * `created_at`, and a ticket created earlier can be updated into the front of
 * some sorts. Max is the only thing the sequence guarantees.
 */
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
 * Face for the draft badge — the bare number, e.g. `9857`.
 *
 * No `#` and no `~` (operator ruling 2026-08-31): the corner already reads as a
 * ticket from the glyph beside it, and a prefix an operator has to strip before
 * saying the number out loud is noise. The badge's honesty is carried by the
 * flash and its "not filed yet" label, not by punctuation.
 */
export function formatDraftTicketNumber(n: NextTicketNumber | null): string | null {
  return n ? String(n.predicted) : null;
}
