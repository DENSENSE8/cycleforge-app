/**
 * Pure helpers: after a tracking-seeded Link search settles with zero hits,
 * flip to Create so staff are not stuck on an empty find list — and paint
 * compact in-surface microcopy that explains why Create opened.
 */

export function shouldAutoCreateFromEmptyTrackingSeed(input: {
  open: boolean;
  mode: 'create' | 'link';
  seededQuery: string;
  ticketQuery: string;
  searchLoading: boolean;
  searchError: string | null;
  resultCount: number;
  hasSelectedTicket: boolean;
  /** Key already flipped this open cycle (`receivingId:seed`), or null. */
  alreadyFlippedKey: string | null;
  flipKey: string;
}): boolean {
  if (!input.open || input.mode !== 'link') return false;
  if (!input.seededQuery) return false;
  if (input.ticketQuery.trim() !== input.seededQuery) return false;
  if (input.searchLoading || input.searchError) return false;
  if (input.resultCount !== 0) return false;
  if (input.hasSelectedTicket) return false;
  if (input.alreadyFlippedKey === input.flipKey) return false;
  return true;
}

/**
 * Flag lifecycle for Create-surface “empty tracking seed” helper.
 * Set only on the auto-flip; clear on close/reopen or any mode change
 * (including a later manual Create ↔ Link switch).
 */
export function nextAutoCreateFromEmptyTrackingFlag(input: {
  prev: boolean;
  event: 'closed' | 'mode-change' | 'empty-seed-flip';
}): boolean {
  switch (input.event) {
    case 'closed':
    case 'mode-change':
      return false;
    case 'empty-seed-flip':
      return true;
  }
}
