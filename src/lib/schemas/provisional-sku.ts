import { z } from 'zod';

/**
 * Bodies for the provisional (on-hold placeholder) product endpoints.
 *
 * The title is capped rather than free — this string becomes a product name on
 * every warehouse surface, and an operator pasting a whole listing description
 * into a phone field should be told, not silently truncated later by a `line-clamp`.
 */

/** POST /api/sku-catalog/provisional */
export const ProvisionalCreateBody = z.object({
  barcode: z.string().trim().min(1).max(64),
  productTitle: z.string().trim().min(2).max(200),
  staffId: z.number().int().positive().optional(),
});

/** POST /api/sku-catalog/provisional/merge */
export const ProvisionalMergeBody = z.object({
  provisionalSku: z.string().trim().min(1).max(120),
  targetSku: z.string().trim().min(1).max(120),
  staffId: z.number().int().positive().optional(),
});

export type ProvisionalCreateInput = z.infer<typeof ProvisionalCreateBody>;
export type ProvisionalMergeInput = z.infer<typeof ProvisionalMergeBody>;
