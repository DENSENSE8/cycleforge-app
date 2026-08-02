import { z } from 'zod';

/**
 * Body for POST /api/receiving-lines/incoming/check-zoho-received.
 * Prefer a single textarea string; string[] is accepted for programmatic callers.
 */
export const CheckZohoReceivedBody = z
  .object({
    trackings: z.union([z.string(), z.array(z.string())]),
  })
  .strict();
