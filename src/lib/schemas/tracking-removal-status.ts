import { z } from 'zod';

/**
 * Body for POST /api/receiving-lines/incoming/tracking-status.
 * Same shape as the ERP check — one paste, two questions, one input contract.
 */
export const TrackingRemovalStatusBody = z
  .object({
    trackings: z.union([z.string(), z.array(z.string())]),
  })
  .strict();
