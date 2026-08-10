import { z } from 'zod';

export const PackPlacementMoveBody = z.object({
  orderId: z.number().int().positive().optional(),
  /** Resolve order by tracking when orderId omitted. */
  tracking: z.string().trim().min(1).optional(),
  locationId: z.number().int().positive().optional(),
  barcode: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(200).optional().nullable(),
}).refine(
  (v) => v.orderId != null || (v.tracking != null && v.tracking.length > 0),
  { message: 'orderId or tracking is required' },
).refine(
  (v) => v.locationId != null || (v.barcode != null && v.barcode.length > 0),
  { message: 'locationId or barcode is required' },
);
