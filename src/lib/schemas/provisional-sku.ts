import { z } from 'zod';

/**
 * Bodies for the provisional (on-hold placeholder) product endpoints.
 *
 * The title is capped rather than free — this string becomes a product name on
 * every warehouse surface, and an operator pasting a whole listing description
 * into a phone field should be told, not silently truncated later by a `line-clamp`.
 */

/**
 * POST /api/sku-catalog/provisional
 *
 * `barcode` is optional: without one the SKU is keyed by `sourceRef` (a form
 * sends one per open sheet, so a double tap joins its own placeholder), and a
 * real barcode can be attached later through PATCH.
 */
export const ProvisionalCreateBody = z.object({
  barcode: z.string().trim().max(64).nullish(),
  sourceRef: z.string().trim().min(1).max(200).nullish(),
  productTitle: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullish(),
  staffId: z.number().int().positive().optional(),
});

/** PATCH /api/sku-catalog/provisional/[sku] — at least one field. `barcode` attaches once. */
export const ProvisionalUpdateBody = z
  .object({
    productTitle: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).optional(),
  })
  .refine(
    (body) => body.productTitle !== undefined || body.description !== undefined || body.barcode !== undefined,
    { message: 'productTitle, description or barcode is required' },
  );

/** POST /api/sku-catalog/provisional/merge */
export const ProvisionalMergeBody = z.object({
  provisionalSku: z.string().trim().min(1).max(120),
  targetSku: z.string().trim().min(1).max(120),
  staffId: z.number().int().positive().optional(),
});

export type ProvisionalCreateInput = z.infer<typeof ProvisionalCreateBody>;
export type ProvisionalMergeInput = z.infer<typeof ProvisionalMergeBody>;
export type ProvisionalUpdateInput = z.infer<typeof ProvisionalUpdateBody>;
