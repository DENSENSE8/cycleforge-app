import { z } from 'zod';
import type { ResolveShipmentExceptionBody as ResolveBody } from '@/lib/shipments/shipment-record-types';

const clientEventId = z.string().trim().min(1).max(200);

/** POST /api/shipments/[id]/resolve-exception — link the unmatched scan to an order, or close it. */
export const ResolveShipmentExceptionBody: z.ZodType<ResolveBody> = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('link-order'),
      orderRowId: z.number().int().positive(),
      clientEventId,
    })
    .strict(),
  z
    .object({
      kind: z.literal('close'),
      reason: z.string().trim().min(1).max(500),
      clientEventId,
    })
    .strict(),
]);

/** GET /api/shipments/lookup?tracking= */
export const ShipmentLookupQuery = z.object({
  tracking: z.string().trim().min(4).max(80),
});
