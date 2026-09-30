import { z } from 'zod';

// ─── POST /api/stock-places ─────────────────────────────────────────────────

/** Make a tote a stock place: `H-12`, `12` or an external tote code. */
export const StockPlaceEnsureBody = z
  .object({
    tote: z.string().trim().min(1).max(64),
  })
  .strict();
