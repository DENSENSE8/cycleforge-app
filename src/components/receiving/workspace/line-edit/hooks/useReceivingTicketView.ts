/**
 * Pure helpers retained for unit tests after Ticket became a Displays tab
 * (`?display=ticket`). Prefer {@link useUnboxDisplayView} at call sites.
 */

/**
 * Pure decision for the clear-on-line-change effect. Clear the open ticket
 * editor only on a genuine sibling-line switch — both ids known and different.
 */
export function shouldClearTicketViewOnLineChange(
  prevLineId: number | null,
  currentLineId: number | null,
  ticketViewOpen: boolean,
): boolean {
  return (
    ticketViewOpen &&
    prevLineId != null &&
    currentLineId != null &&
    prevLineId !== currentLineId
  );
}
