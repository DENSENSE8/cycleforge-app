/**
 * Auto-cage decision — the PURE half of `auto-cage.ts`.
 *
 * Split from the IO half exactly like `order-exception-types.ts` /
 * `create-task-core.ts`: this module imports nothing that reaches the DB, so
 * the unit gate can exercise the split rule without Neon.
 *
 * Operator 2026-09-01 (R-FLOW-7): the cage is **unpaired catalog SKU** only.
 * Missing manuals or shipping labels are To-ship paperwork, not an exception.
 * Amends R-FLOW-2's "full gates" auto-cage.
 */

export interface AutoCageCandidate {
  id: number;
  /** `orders.status` free text at evaluation time. */
  status: string | null;
  /**
   * G4: the order's item resolves to a `sku_catalog` row.
   * `false` → exception desk; `true` → live To-ship (paperwork may still be open).
   */
  paired: boolean;
}

/**
 * Pure: which of these freshly inserted orders belong in the cage?
 * Already-fulfilled rows never cage (the eBay lane imports 30 days of
 * already-shipped orders; Amazon FBA rows land shipped — those need no
 * triage); a paired row is accepted even when G2/G3 are still red.
 */
export function selectAutoCageIds(candidates: AutoCageCandidate[]): number[] {
  return candidates
    .filter((c) => String(c.status || '').trim().toLowerCase() !== 'shipped')
    .filter((c) => !c.paired)
    .map((c) => c.id);
}
