/**
 * Auto-cage decision — the PURE half of `auto-cage.ts`.
 * Operator 2026-09-01 (R-FLOW-7): the cage is **unpaired catalog SKU** only.
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

/** Pure: which of these freshly inserted orders belong in the cage? */
export function selectAutoCageIds(candidates: AutoCageCandidate[]): number[] {
  return candidates
    .filter((c) => String(c.status || '').trim().toLowerCase() !== 'shipped')
    .filter((c) => !c.paired)
    .map((c) => c.id);
}
