import { z } from 'zod';
import { OUTBOUND_HANDLING_FACTS } from '@/lib/shipping/outbound-handling-facts';

// ─── Reusable building blocks ───────────────────────────────────────────────

const trimmed = z.string().trim();
/** Optional text that may be explicitly cleared with null. */
const optNullableText = trimmed.min(1).nullable().optional();
const optPackTier = z.enum(['SMALL', 'MEDIUM', 'LARGE']).nullable().optional();
const optNonNegInt = z.number().int().nonnegative().nullable().optional();

/** Sourcing lifecycle signal shared by create + update bodies (Bose engine). */
const lifecycleStatusEnum = z.enum(['active', 'eol', 'discontinued', 'nrnd', 'unknown']);
/** Per-SKU pack/handling guidance (multi-line, may be cleared with null). */
const optPackNotes = trimmed.max(4000).nullable().optional();
const handlingFactEnum = z.enum(OUTBOUND_HANDLING_FACTS);
/** Absent preserves the catalog value; an explicit empty array clears it. */
const optHandlingFacts = z.array(handlingFactEnum).max(3).transform((facts) => [...new Set(facts)]).optional();

// ─── POST /api/sku-catalog ──────────────────────────────────────────────────

/**
 * Create a SKU catalog entry. `sku` + `productTitle` are required; the rest
 * are optional metadata. `idempotencyKey` lets a retried create replay the
 * original response instead of 409-ing on the natural unique key (`sku`).
 */
export const SkuCatalogCreateBody = z
  .object({
    sku: trimmed.min(1, 'sku is required'),
    productTitle: trimmed.min(1, 'productTitle is required'),
    category: optNullableText,
    upc: optNullableText,
    ean: optNullableText,
    imageUrl: optNullableText,
    isActive: z.boolean().optional(),
    // ─ Sourcing lifecycle (Bose engine opt-in; additive, all optional) ─
    lifecycleStatus: lifecycleStatusEnum.optional(),
    reorderThreshold: optNonNegInt,
    lastKnownCostCents: optNonNegInt,
    sourcingNotes: optNullableText,
    replenishTargetCents: optNonNegInt,
    /** "How to pack this product" guidance shown to the packer (P1-PCK-02). */
    packNotes: optPackNotes,
    /** Closed warehouse warnings projected into the outbound row. */
    handlingFacts: optHandlingFacts,
    /**
     * Polymorphic pack-profile override linked to this SKU (not stored on sku_catalog).
     * Null clears the link (falls back to rule-based defaults).
     */
    packTier: optPackTier,
    /** Optional override minutes for this SKU (NULL clears). */
    estimatedPackMinutes: optNonNegInt,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

// ─── PATCH /api/sku-catalog/[id] ────────────────────────────────────────────

/**
 * Partial update. `sku` is intentionally NOT editable here — it's the natural
 * key the rest of the system joins on; renames go through a dedicated flow.
 */
export const SkuCatalogUpdateBody = z
  .object({
    productTitle: trimmed.min(1).optional(),
    category: optNullableText,
    upc: optNullableText,
    ean: optNullableText,
    /** The tenant's LICENSED GS1 GTIN for this product. */
    gtin: trimmed.min(1).nullable().optional(),
    imageUrl: optNullableText,
    isActive: z.boolean().optional(),
    // ─ Sourcing lifecycle (Bose engine opt-in; additive, all optional) ─
    lifecycleStatus: lifecycleStatusEnum.optional(),
    reorderThreshold: optNonNegInt,
    lastKnownCostCents: optNonNegInt,
    sourcingNotes: optNullableText,
    replenishTargetCents: optNonNegInt,
    /** "How to pack this product" guidance shown to the packer (P1-PCK-02). */
    packNotes: optPackNotes,
    /** Explicit empty array clears the governed product-level warnings. */
    handlingFacts: optHandlingFacts,
    /** Optional pack-profile override linked to this SKU (polymorphic). */
    packTier: optPackTier,
    /** Optional minutes override linked to this SKU (polymorphic). */
    estimatedPackMinutes: optNonNegInt,
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field must be provided',
  });

// ─── POST /api/sku-catalog/flag-missing ─────────────────────────────────────

/** Flag an item that was identified (e.g. */
export const SkuCatalogFlagMissingBody = z
  .object({
    sku: trimmed.min(1, 'sku is required'),
    suggestedTitle: optNullableText,
    source: trimmed.min(1).max(64).optional(),
  })
  .strict();

// ─── /api/pending-skus (the "create in Zoho" to-do queue) ───────────────────

/** Mirrors PendingSkuStatus in src/lib/inventory/pending-skus.ts. */
const pendingSkuStatusEnum = z.enum(['PENDING', 'CREATED', 'IGNORED', 'DUPLICATE']);

/**
 * Query filter for GET /api/pending-skus. `status` defaults to PENDING in the
 * lib; `limit` is clamped to 1..1000 there, so we only validate shape here.
 */
export const PendingSkuListQuery = z
  .object({
    status: pendingSkuStatusEnum.optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
  })
  .strict();

/** Steward action: drop a junk SKU from the to-do list (PATCH /api/pending-skus). */
export const PendingSkuIgnoreBody = z
  .object({
    id: z.coerce.number().int().positive(),
    notes: optNullableText,
  })
  .strict();
