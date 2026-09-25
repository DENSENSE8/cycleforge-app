import { z } from 'zod';

export const PairPickingToteBody = z.object({
  sessionId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  toteScan: z.string().trim().min(1).max(512),
});
