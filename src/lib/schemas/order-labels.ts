import { z } from 'zod';
import { LABEL_PURPOSES } from '@/lib/shipping/label-purpose';

/** POST /api/orders/[id]/labels — pair a ShipStation label with the order. */
export const LinkOrderLabelBody = z.object({
  /** v1 shipment id — the label is `se-<id>`. */
  shipstationShipmentId: z.number().int().positive(),
  purpose: z.enum(LABEL_PURPOSES),
  /** Idempotency key minted once per intended link. */
  clientEventId: z.string().trim().min(8).max(128),
});

/** POST /api/orders/[id]/labels/[labelId]/ticket — `#48120` or `48120`. */
export const LinkLabelTicketBody = z.object({
  ticket: z.string().trim().min(1).max(32),
});
