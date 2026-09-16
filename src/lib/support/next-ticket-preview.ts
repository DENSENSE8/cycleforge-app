/**
 * The support ticket number the NEXT repair intake will most likely get.
 * Pure; no HTTP, no provider client.
 *
 * ## Why a projection and not a reservation
 *
 * Operator 2026-09-15: the review step should show the paperwork, and *"in the
 * paperwork it shows the preview of the support ticket … it hits the API's
 * Zendesk with the next iteration or the next ticket that will be created."*
 *
 * Zendesk has no "reserve an id" call and no "next id" endpoint. Ids are
 * assigned at create time from a sequence shared with every other source in
 * the account — email, web form, another counter, an automation. So the only
 * honest thing available is a PROJECTION: read the newest ticket id and add
 * one.
 *
 * That projection is right whenever this intake is the next ticket the account
 * creates, and wrong by however many tickets arrive in between. It is
 * therefore a PREVIEW — the number the customer sees while signing, never a
 * reservation, and the screen says "expected" for exactly that reason.
 *
 * Nothing downstream depends on it being right. Traced 2026-09-15: the
 * `CREATE_TICKET` outbox drain stamps `repair_service.ticket_number`
 * (`ticket-outbox.ts`), and `/api/repair-service/print/[id]:101` renders
 * `formatRepairPaperTicketNumber(repair.ticket_number)`. So the PAPER already
 * carries the real id with no help from this module — which is what makes a
 * projection acceptable here instead of creating a ticket at review time to
 * obtain a real one (that would mint a ticket for every abandoned review).
 *
 * The counter must never block on this. Every failure — no helpdesk provider
 * configured, an auth error, an empty account — resolves to `null`, and the
 * paperwork simply shows no number, exactly as it did before this existed.
 *
 * Callers: `GET /api/kiosk/repair/next-ticket`. Affected API: that route.
 * Schemas: none — the helpdesk account's ticket list, read-only.
 */

/**
 * Newest existing ticket id → the id the next create will most likely take.
 *
 * `null` in, `null` out: an account with no tickets yet gives us nothing to
 * count from, and inventing `#1` would be a guess dressed as a fact.
 */
export function projectNextTicketId(newestId: number | null | undefined): number | null {
  if (typeof newestId !== 'number' || !Number.isFinite(newestId)) return null;
  const floored = Math.floor(newestId);
  if (floored < 1) return null;
  return floored + 1;
}

export interface NextTicketPreviewDeps {
  /**
   * Highest ticket id in the account, or null. Injected so the projection is
   * unit-tested without a provider: the real one lists one ticket sorted by id
   * descending.
   */
  newestTicketId: () => Promise<number | null>;
  /** Failure sink. Injected so a test asserts the log without console noise. */
  onError?: (error: unknown) => void;
}

/**
 * The preview, or `null`. Never throws — see the posture note above.
 */
export async function previewNextSupportTicketId(
  deps: NextTicketPreviewDeps,
): Promise<number | null> {
  try {
    return projectNextTicketId(await deps.newestTicketId());
  } catch (error) {
    deps.onError?.(error);
    return null;
  }
}
