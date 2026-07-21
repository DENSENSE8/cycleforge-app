/**
 * Packing-mode table tabs on `/review` (Packed · Shipped · History).
 * Distinct from the legacy outcome-queue buckets (needs_review / …).
 */

export const REVIEW_PACKING_TABS = ['packed', 'shipped', 'history'] as const;
export type ReviewPackingTab = (typeof REVIEW_PACKING_TABS)[number];

function isReviewPackingTab(v: unknown): v is ReviewPackingTab {
  return typeof v === 'string' && (REVIEW_PACKING_TABS as readonly string[]).includes(v);
}

export function parseReviewPackingTab(v: string | null | undefined): ReviewPackingTab {
  return isReviewPackingTab(v) ? v : 'packed';
}
