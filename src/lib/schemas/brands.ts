import { z } from 'zod';
import { BRAND_ALIAS_SOURCES, BRAND_KINDS } from '@/lib/brands/normalize';

const brandName = z.string().trim().min(1).max(80);
const aliasText = z.string().trim().min(1).max(80);
const publisher = z.string().trim().max(120);
const brandId = z.number().int().positive();

export const BrandKindSchema = z.enum(BRAND_KINDS);

/** GET /api/brands — typeahead. Unknown params are ignored (reads never 400 on a cache-buster). */
export const BrandListQuery = z.object({
  q: z.string().max(80).optional().default(''),
  kind: BrandKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/** GET /api/brands/[id]/products. */
export const BrandProductsQuery = z.object({
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
});

/**
 * POST /api/brands. Strict: an `organizationId` (or any unknown key) in the
 * body is refused — the org only ever comes from the session.
 */
export const BrandCreateBody = z
  .object({
    name: brandName,
    kind: BrandKindSchema.optional().default('brand'),
    parentBrandId: brandId.nullable().optional(),
    publisher: publisher.nullable().optional(),
    aliases: z.array(aliasText).max(50).optional().default([]),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/** PATCH /api/brands/[id] — at least one change. Strict for the same reason as create. */
export const BrandUpdateBody = z
  .object({
    name: brandName.optional(),
    kind: BrandKindSchema.optional(),
    parentBrandId: brandId.nullable().optional(),
    publisher: publisher.nullable().optional(),
    isActive: z.boolean().optional(),
    aliasesAdd: z.array(aliasText).max(50).optional(),
    aliasesRemove: z.array(aliasText).max(50).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'no changes' });

export type BrandCreateInput = z.infer<typeof BrandCreateBody>;
export type BrandUpdateInput = z.infer<typeof BrandUpdateBody>;

/**
 * agent_mutations payload for `brand.create` (review class). The backfill
 * proposes unknown Zoho brands this way: approving creates the brand with a
 * `zoho` alias and assigns the listed SKUs (Zoho governs → zoho, 1.00).
 */
export const BrandCreateMutationPayload = BrandCreateBody.omit({ idempotencyKey: true })
  .extend({
    aliasSource: z.enum(BRAND_ALIAS_SOURCES).optional(),
    assignSkuCatalogIds: z.array(z.number().int().positive()).max(5000).optional(),
    dedupeKey: z.string().max(200).optional(),
  })
  .strict();

/** agent_mutations payload for `brand.update` (review class). */
export const BrandUpdateMutationPayload = z
  .object({
    brandId,
    name: brandName.optional(),
    kind: BrandKindSchema.optional(),
    parentBrandId: brandId.nullable().optional(),
    publisher: publisher.nullable().optional(),
    isActive: z.boolean().optional(),
    aliasesAdd: z.array(aliasText).max(50).optional(),
    aliasesRemove: z.array(aliasText).max(50).optional(),
    dedupeKey: z.string().max(200).optional(),
  })
  .strict();

/**
 * agent_mutations payload for `sku_brand.assign` (review class). Evidence
 * keys the proposer attaches (confidence, source, reason, matched, …) pass
 * through untouched; `restore` is set only on the inverse written for revert.
 */
export const SkuBrandAssignPayload = z
  .object({
    skuCatalogId: z.number().int().positive(),
    brandId: brandId.nullable(),
    restore: z
      .object({
        brandId: brandId.nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        source: z.string().max(32).nullable(),
      })
      .optional(),
  })
  .passthrough();
