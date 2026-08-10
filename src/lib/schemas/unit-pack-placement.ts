import { z } from 'zod';

export const UnitPackPlacementMoveBody = z.object({
  unitId: z.number().int().positive().optional(),
  /** Resolve the unit by scanned unit-id / uid / serial when unitId omitted. */
  unitScan: z.string().trim().min(1).optional(),
  locationId: z.number().int().positive().optional(),
  barcode: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(200).optional().nullable(),
}).refine(
  (v) => v.unitId != null || (v.unitScan != null && v.unitScan.length > 0),
  { message: 'unitId or unitScan is required' },
).refine(
  (v) => v.locationId != null || (v.barcode != null && v.barcode.length > 0),
  { message: 'locationId or barcode is required' },
);
