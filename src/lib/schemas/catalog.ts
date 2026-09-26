import { z } from 'zod';

/** Request bodies for the org-scoped platform / type catalog CRUD (/api/catalog/platforms, /api/catalog/types). */

const trimmed = z.string().trim();
const slug = trimmed
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'slug must be lowercase letters, numbers, or underscores');

/** Org platform / type accent — `#RRGGBB` only; ink is derived at render. */
const colorHex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'colorHex must be #RRGGBB')
  .nullable()
  .optional();

/**
 * Dense face for the 2x1 label / ledger band (`platforms.short_label`,
 * `platform_accounts.short_label`) — ≤ 8 chars, stored upper-case. `null`
 * clears back to the built-in compact / full label.
 */
const shortLabel = trimmed
  .min(1)
  .max(8, 'shortLabel must be 8 characters or fewer')
  .transform((s) => s.toUpperCase())
  .nullable()
  .optional();

const typeKind = z.enum(['receiving', 'shipping', 'both']);

// ─── platforms ────────────────────────────────────────────────────────────────

export const PlatformCreateBody = z
  .object({
    label: trimmed.min(1, 'label is required'),
    slug: slug.optional(),
    tone: trimmed.min(1).nullable().optional(),
    colorHex,
    provider: trimmed.min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const PlatformUpdateBody = z
  .object({
    label: trimmed.min(1).optional(),
    shortLabel,
    tone: trimmed.min(1).nullable().optional(),
    colorHex,
    provider: trimmed.min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field must be provided' });

// ─── types ──────────────────────────────────────────────────────────────────

// platform_account_id binding (nullable to clear) + workflow_node_id picker
// (Phase 5 — the custom "own repair-service flow"). A positive int id, or null.
const accountBinding = z.number().int().positive().nullable();
const workflowNodeId = trimmed.min(1).max(128).nullable();

export const TypeCreateBody = z
  .object({
    label: trimmed.min(1, 'label is required'),
    slug: slug.optional(),
    kind: typeKind.optional(),
    colorHex,
    isReturn: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    platformAccountId: accountBinding.optional(),
    workflowNodeId: workflowNodeId.optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const TypeUpdateBody = z
  .object({
    label: trimmed.min(1).optional(),
    kind: typeKind.optional(),
    colorHex,
    isReturn: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    platformAccountId: accountBinding.optional(),
    workflowNodeId: workflowNodeId.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field must be provided' });

// ─── priority_tiers ───────────────────────────────────────────────────────────

/** Rename / repaint ONE rung of the priority ladder. */
export const PriorityTierUpdateBody = z
  .object({
    label: trimmed.min(1).max(40).optional(),
    short: trimmed.min(1).max(8).optional(),
    colorHex,
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field must be provided' });

// ─── platform_accounts ────────────────────────────────────────────────────────

export const PlatformAccountCreateBody = z
  .object({
    platformId: z.number().int().positive(),
    label: trimmed.min(1, 'label is required'),
    slug: slug.optional(),
    integrationScope: trimmed.min(1).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const PlatformAccountUpdateBody = z
  .object({
    label: trimmed.min(1).optional(),
    shortLabel,
    integrationScope: trimmed.min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field must be provided' });

// ─── integration_store_links ──────────────────────────────────────────────────

export const StoreLinkUpsertBody = z
  .object({
    provider: z.literal('shipstation'),
    externalStoreId: z.string().trim().regex(/^\d+$/, 'externalStoreId must be a store id'),
    platformId: z.number().int().positive(),
    platformAccountId: z.number().int().positive().nullable(),
  })
  .strict();
