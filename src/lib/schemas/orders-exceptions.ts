import { z } from 'zod';

/** PATCH /api/orders-exceptions/[id] — tracking-only edit on a hold-bucket row. */
export const OrderExceptionPatchBody = z
  .object({
    shippingTrackingNumber: z.string().trim().min(1),
  })
  .strict();
