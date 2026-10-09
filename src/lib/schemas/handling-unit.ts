import { z } from 'zod';
import { MAX_TOTE_PRINT_RUN } from '@/lib/print/labelCopies';

// ─── Reusable building blocks ───────────────────────────────────────────────

const positiveInt = z.number().int().positive();
const optNullableNotes = z.string().trim().min(1).nullable().optional();

/** Operator-supplied unit references — accepts ids, `U-{id}`, unit_uid, serial. */
const unitRefs = z
  .array(z.union([z.string().trim().min(1), positiveInt]))
  .min(1, 'At least one unit reference is required')
  .max(500, 'Too many units in one request')
  .transform((arr) => arr.map((v) => String(v)));

// ─── POST /api/handling-units ───────────────────────────────────────────────

/** Mint a handling unit (box/tray). */
export const HandlingUnitCreateBody = z
  .object({
    code: z.string().trim().min(1).max(64).nullable().optional(),
    locationId: positiveInt.nullable().optional(),
    notes: optNullableNotes,
    units: unitRefs.optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

type HandlingUnitCreateInput = z.infer<typeof HandlingUnitCreateBody>;

// ─── POST /api/handling-units/bulk ──────────────────────────────────────────

/** Mint N boxes in one call (bulk tote mint → one label run). */
export const HandlingUnitBulkCreateBody = z
  .object({
    count: z.number().int().min(1).max(MAX_TOTE_PRINT_RUN),
    locationId: positiveInt.nullable().optional(),
    notes: optNullableNotes,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

type HandlingUnitBulkCreateInput = z.infer<typeof HandlingUnitBulkCreateBody>;

// ─── POST /api/handling-units/[id]/assign ───────────────────────────────────

/** Add units to a box. */
export const HandlingUnitAssignBody = z
  .object({
    units: unitRefs,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

type HandlingUnitAssignInput = z.infer<typeof HandlingUnitAssignBody>;

// ─── POST /api/handling-units/[id]/unassign ─────────────────────────────────

/** Remove units from a box (their handling_unit_id → NULL). */
export const HandlingUnitUnassignBody = z
  .object({
    units: unitRefs,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

type HandlingUnitUnassignInput = z.infer<typeof HandlingUnitUnassignBody>;

// ─── POST /api/handling-units/[id]/load ─────────────────────────────────────

/** Move a shelf's loose stock (some SKUs or all of them) into the tote. */
export const HandlingUnitLoadBody = z
  .object({
    locationCode: z.string().trim().min(1).max(128),
    lines: z
      .array(z.object({ sku: z.string().trim().min(1).max(128), qty: positiveInt }).strict())
      .min(1, 'Choose at least one item')
      .max(500, 'Too many items in one request'),
    park: z.boolean(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();
