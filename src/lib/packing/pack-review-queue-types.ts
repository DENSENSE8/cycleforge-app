/**
 * Client-safe types + bucket vocabulary for the packer review queue (plan §4c).
 * Kept out of pack-review-queue.ts (which imports the server-only `tenantQuery`)
 * so the Review station UI + its hook can import the shapes without pulling the
 * database into the client bundle.
 */

const PACK_REVIEW_BUCKETS = [
  'needs_review',
  'exceptions',
  'flagged',
  'approved',
  /** Decided / exception history for packers (table History tab). */
  'history',
  /** All latest outcomes (any) — used to hydrate Packed/Shipped outcome chips. */
  'latest',
] as const;
export type PackReviewBucket = (typeof PACK_REVIEW_BUCKETS)[number];

export function isPackReviewBucket(v: unknown): v is PackReviewBucket {
  return typeof v === 'string' && (PACK_REVIEW_BUCKETS as readonly string[]).includes(v);
}

export interface PackReviewQueueRow {
  packerLogId: number;
  outcome: string;
  detectedTracking: string | null;
  detectedOrderId: string | null;
  shipmentId: number | null;
  reviewNote: string | null;
  verifiedByStaffId: number | null;
  ocrConfidence: number | null;
  createdAt: string;
  orderId: string | null;
  productTitle: string | null;
  tracking: string | null;
  /** Catalog SKU for pack-profile edit (nullable when unlinked). */
  skuCatalogId: number | null;
  itemNumber: string | null;
  packTier: string | null;
  estimatedPackMinutes: number | null;
}
