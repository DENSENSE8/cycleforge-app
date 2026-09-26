/**
 * The support ticket number the NEXT repair intake will most likely get.
 * Operator 2026-09-15: the review step should show the paperwork, and *"in the
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
