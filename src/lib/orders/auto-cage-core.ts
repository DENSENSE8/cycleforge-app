/**
 * Auto-cage decision — the PURE half of `auto-cage.ts`.
 *
 * Split from the IO half exactly like `order-exception-types.ts` /
 * `create-task-core.ts`: this module imports nothing that reaches the DB, so
 * the unit gate can exercise the split rule without Neon.
 */

export interface AutoCageCandidate {
  id: number;
  /** `orders.status` free text at evaluation time. */
  status: string | null;
  /** The live verdict from the ONE gate rule (`evaluateReleaseGates`). */
  canRelease: boolean;
}

/**
 * Pure: which of these freshly inserted orders belong in the cage?
 * Already-fulfilled rows never cage (the eBay lane imports 30 days of
 * already-shipped orders; Amazon FBA rows land shipped — those need no
 * triage); a row whose gates all pass is accepted.
 */
export function selectAutoCageIds(candidates: AutoCageCandidate[]): number[] {
  return candidates
    .filter((c) => String(c.status || '').trim().toLowerCase() !== 'shipped')
    .filter((c) => !c.canRelease)
    .map((c) => c.id);
}
