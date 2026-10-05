import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();

/** GET /api/support/order-candidates?q= */
export const SupportOrderCandidatesQuery = z.object({
  q: z.string().trim().min(1).max(500),
});

/** One exact order to link: `orderId` is `orders.id`; `externalReference` is the pasted text kept beside it. */
const SupportOrderLinkInput = z.object({
  orderId: positiveId,
  primary: z.boolean().optional(),
  externalReference: z.string().trim().max(500).nullable().optional(),
});

/** POST /api/support/items/[id]/orders — link orders / set the primary (`[{ orderId, primary: true }]`). */
export const SupportItemOrdersLinkBody = z
  .object({ links: z.array(SupportOrderLinkInput).min(1).max(20) })
  .refine((b) => b.links.filter((l) => l.primary).length <= 1, {
    message: 'Only one order can be the primary order',
    path: ['links'],
  });
export type SupportItemOrdersLinkBody = z.infer<typeof SupportItemOrdersLinkBody>;

/** DELETE /api/support/items/[id]/orders?orderId= */
export const SupportItemOrdersUnlinkQuery = z.object({ orderId: positiveId });

/** GET /api/support/check-ins?orderId= */
export const SupportCheckInQuery = z.object({ orderId: positiveId });
