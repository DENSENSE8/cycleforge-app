/**
 * Pure helpers retained for unit tests after Claim nested under Ticket
 * (`?display=ticket&ticketAction=claim`). Prefer {@link useUnboxDisplayView}.
 */

/**
 * Pure decision for the clear-on-line-change effect. Clear only on a genuine
 * sibling-line switch — both ids known and different.
 */
export function shouldClearClaimViewOnLineChange(
  prevLineId: number | null,
  currentLineId: number | null,
  claimViewOpen: boolean,
): boolean {
  return (
    claimViewOpen &&
    prevLineId != null &&
    currentLineId != null &&
    prevLineId !== currentLineId
  );
}
