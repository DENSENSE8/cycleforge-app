import { z } from 'zod';

const trimmed = z.string().trim();
const nullableText = trimmed.min(1).nullable();

// ─── PATCH /api/orders/[id] ─────────────────────────────────────────────────

export const OrderUpdateBody = z
  .object({
    productTitle: trimmed.min(1).optional(),
    sku: nullableText.optional(),
    condition: trimmed.min(1).optional(),
    quantity: nullableText.optional(),
    itemNumber: nullableText.optional(),
    shipByDate: nullableText.optional(),
    // `notes` is deliberately absent.
    isOutOfStock: z.boolean().optional(),
    accountSource: nullableText.optional(),
    // Operator-set admin page link; null clears it (the derived URL returns).
    adminUrl: trimmed
      .url()
      .refine((v) => /^https?:\/\//i.test(v), { message: 'Link must start with http:// or https://' })
      .nullable()
      .optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field must be provided',
  });

// ─── Tracking sub-resource:

const trackingNum = z.string().trim().min(1);

export const OrderTrackingPostBody = z
  .object({
    // Primary tracking (slot 0); upsert. '' / null clears it.
    trackingNumber: z.string().trim().nullable().optional(),
    // Additional (non-primary) tracking links to create.
    creates: z.array(z.object({ trackingNumber: trackingNum })).optional(),
    setPrimaryShipmentId: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((b) => b.trackingNumber !== undefined || (b.creates?.length ?? 0) > 0, {
    message: 'Provide trackingNumber or at least one create',
  });

export const OrderTrackingPatchBody = z
  .object({
    // Desired-state:
    setTrackingNumbers: z.array(trackingNum).optional(),
    // Primary tracking (slot 0); upsert. '' / null clears it.
    primaryTrackingNumber: z.string().trim().nullable().optional(),
    edits: z
      .array(z.object({ shipmentId: z.number().int().positive(), trackingNumber: trackingNum }))
      .optional(),
    creates: z.array(z.object({ trackingNumber: trackingNum })).optional(),
    deletes: z.array(z.object({ shipmentId: z.number().int().positive() })).optional(),
    setPrimaryShipmentId: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.setTrackingNumbers !== undefined ||
      b.primaryTrackingNumber !== undefined ||
      b.edits !== undefined ||
      b.creates !== undefined ||
      b.deletes !== undefined ||
      b.setPrimaryShipmentId !== undefined,
    { message: 'At least one tracking operation required' },
  );
