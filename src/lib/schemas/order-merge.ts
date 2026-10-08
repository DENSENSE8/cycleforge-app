import { z } from 'zod';

/** POST /api/orders/merge-stub — absorb a duplicate stub order into the surviving order. */
export const MergeStubBody = z
  .object({
    /** The duplicate row being absorbed (its labels/links/notes move, then it is deleted). */
    stubOrderId: z.number().int().positive(),
    /** The surviving orders.id the stub's labels land on. */
    targetOrderId: z.number().int().positive(),
  })
  .refine((b) => b.stubOrderId !== b.targetOrderId, {
    message: 'stubOrderId and targetOrderId must be different orders',
    path: ['stubOrderId'],
  });
